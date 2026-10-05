> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../../README.md) for its successor and remaining limits.

# Dependencies and supply chain — 29 September 2026

**Scope.** Read-only pass on the root npm app `agentic-economy` and its only workspace, `packages/cli`. Commands: `npm outdated --long` / `npm outdated --json`, and `npm audit --omit=dev --json`, on Node v22.22.0 and npm 11.5.1 (the `packageManager` pin). Both commands exited 1, which is their "something is behind / vulnerable" status, not a crashed run. Registry answers are from that run. Nothing was installed, updated, or `audit fix`'d. Lockfile is `package-lock.json` v3. Import use was checked in `src/`, `convex/`, `tools/`, `tests/`, `scripts/`, `packages/`, root config, and npm scripts, then checked again for the unused candidates.

**Verdict.** 69 direct production dependencies and 26 direct devDependencies. The production install has **9 vulnerable packages (3 high, 6 moderate, 0 critical)** covering 18 advisories, all with a fix available. The only direct one is exact-pinned `undici@7.29.0`, and its fix is the same-major `7.30.0`. **8 production dependencies are a major behind latest.** No production dependency is pinned to a prerelease. Dev `nitro` is pinned to a nightly from 28 June 2026. Direct production licences are permissive (MIT, Apache-2.0, ISC, or Apache-2.0 AND MIT). The Formance tarball omits the `license` field, but its `LICENSE` file is MIT. The production tree's only copyleft is MPL-2.0 `lightningcss`, pulled in by TanStack Start. Three direct declarations have no import: `@rjsf/validator-ajv8`, `react-resizable-panels`, and dev `aislop`.

## Direct dependencies

| | Count |
|---|---:|
| Production `dependencies` | 69 |
| `devDependencies` | 26 |
| Optional / peer (root) | 0 / 0 |
| Workspace packages | 1 (`packages/cli`, no dependencies of its own) |
| Exact `x.y.z` production pins | 38 |
| Caret production ranges | 30 |
| Other production spec | 1, `file:vendor/formance-formance-sdk-7.0.0.tgz` |
| Lockfile package entries | 1,280 |
| `npm audit` production count | 709 (dev 534, optional 224, peer 36; categories overlap, total 1,280) |
| Paths reached by walking root `dependencies` | 727 |

`engines.node` is `22.x`. Fifteen production packages match latest, including `@base-ui/react`, `@cfworker/json-schema`, `@convex-dev/migrations`, the Formance SDK, `@typesafe-ai/sdk`, `class-variance-authority`, `clsx`, `cmdk`, `decimal.js`, `embla-carousel-react`, `openapi-fetch`, `proper-lockfile`, `react-markdown`, `remark-gfm`, and `tw-animate-css`. Two dev packages match latest: `jsdom@29.1.1` and `@types/proper-lockfile@4.1.4`.

Of the 69 production packages, 54 are behind latest. Seventeen of those can move inside the declared range (`wanted` ≠ `current`). The other 37 stay put because the spec is exact, or because a `^0.x` range does not include the next minor. Twenty-four of 26 dev packages are behind, including the Nitro alias below.

`package.json` `overrides` force `@coinbase/cdp-sdk`'s `axios` to `1.18.1`, pin `@opentelemetry/exporter-trace-otlp-http` to `0.219.0`, and hold the Shiki family at `^3.23.0` (`package.json:170-181`).

## Production audit

`npm audit --omit=dev --json`: **3 high, 6 moderate, 0 low, 0 critical** (9 packages, 18 advisories). `fixAvailable` is true for every one. Only `undici` names the fixed version.

| Package | Severity | Installed | How it enters the prod tree | Fix |
|---|---|---|---|---|
| `fast-uri` | high (5) | 3.1.5 | `@modelcontextprotocol/sdk@1.30.0` → `ajv@8.20.0`. The same hoisted copy is also reached from `@rjsf/validator-ajv8`. | yes |
| `js-yaml` | high (1) | 4.3.1 | `@tanstack/react-start` → `@tanstack/react-start-rsc` → `@tanstack/start-plugin-core` → `xmlbuilder2` | yes |
| `browserslist` | high (2) | 4.28.4 | `@tanstack/react-start` → … → `babel-dead-code-elimination` → `@babel/core` | yes |
| `undici` | moderate (1) | 7.29.0 | Direct pin `package.json:134`. Also `@ai-sdk/provider-utils`. | `7.30.0`, not a major |
| `hono` | moderate (3) | 4.13.3 | `@modelcontextprotocol/sdk` | yes |
| `qs` | moderate (2) | 6.15.3 | `@modelcontextprotocol/sdk` → `express@5.2.1` | yes |
| `ip-address` | moderate (2) | 10.5.0 | `@modelcontextprotocol/sdk` → `express-rate-limit` | yes |
| `fflate` | moderate (1) | 0.4.8 | `posthog-js` (nested `node_modules/posthog-js/node_modules/fflate`) | yes |
| `baseline-browser-mapping` | moderate (1) | 2.10.40 | same Babel chain as `browserslist` | yes |

Advisory titles, as reported by npm:

- **fast-uri** (all on 3.1.5, which sits inside every listed range): host confusion via skipped IDN canonicalization ([GHSA-5jgf-p345-68v8](https://github.com/advisories/GHSA-5jgf-p345-68v8)), SSRF via malformed IPv6 ([GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc)), SSRF via repeated hostname percent-decoding ([GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf)), host confusion via percent-encoded scheme ([GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp)), authority injection via an unvalidated port ([GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3)). `@rjsf/utils` also nests `fast-uri@4.1.4`, which is outside `3.0.0–3.1.6` and was not flagged.
- **js-yaml:** `maxTotalMergeKeys` does not limit CPU for empty merge sources ([GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh)). This is not the direct `yaml@2.9.0` package (eemeli), which was not in the audit.
- **browserslist:** unbounded memory growth from distinct queries ([GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx)); crash / prototype write via untrusted `browserslist-stats.json` ([GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g)).
- **undici:** WebSocket permessage-deflate decompression can throw and take down the process ([GHSA-3wwx-pv8p-q78v](https://github.com/advisories/GHSA-3wwx-pv8p-q78v)), range `>=7.28.0 <7.29.1`. The app imports `undici` `Agent` / `fetch` on the x402 call path (`src/modules/capability-execution/call-worker/runRelease.ts:6`, `src/modules/network-guard/server.ts:1`, and the money action files). This pass did not show that those call sites use the WebSocket client. The manifest pin is exact, so a lockfile-only update cannot reach `7.30.0`. Latest on npm is `8.11.2`; the advisory does not require that major.
- **hono** `<4.13.5`: `toSSG()` still writes outside the output directory ([GHSA-gqvv-2mrq-wpjv](https://github.com/advisories/GHSA-gqvv-2mrq-wpjv)); unbounded `parseBody()` nesting ([GHSA-g6gw-c38x-mqfc](https://github.com/advisories/GHSA-g6gw-c38x-mqfc)); query parser reads past the URL fragment ([GHSA-crvj-82cr-hjcx](https://github.com/advisories/GHSA-crvj-82cr-hjcx)).
- **qs** `6.15.3`: array-limit bypass ([GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx)); DoS via attacker-controlled `isBuffer` ([GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g)).
- **ip-address** `10.5.0`: `isLinkLocal()` treats `fe80::/64` rather than `fe80::/10` ([GHSA-rpw4-54j3-4h4q](https://github.com/advisories/GHSA-rpw4-54j3-4h4q)); NAT64 `64:ff9b:1::/48` is not classified ([GHSA-2vr4-cq9g-pvrc](https://github.com/advisories/GHSA-2vr4-cq9g-pvrc)).
- **fflate** `0.4.8`: `unzipSync` can loop on a malformed ZIP64 archive ([GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98)).
- **baseline-browser-mapping** `2.10.40`: process termination on invalid input ([GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv)), fixed at `>=2.11.0`.

`@modelcontextprotocol/sdk` is a runtime import (`src/lib/server/mcp-api.ts:6-14`, `src/modules/capability-supply/internal/route-transport-mcp.ts:1`), so `fast-uri`, `hono`, `qs`, and `ip-address` sit under a production server dependency, not a dev-only install. `browserslist`, `baseline-browser-mapping`, and `js-yaml` sit under `@tanstack/react-start`, which is also a production dependency; their parents are the Start/Babel/xmlbuilder chain. This pass did not trace each advisory to a request handler.

## Major versions behind

"Major behind" means the numeric major of `latest` is greater than `current`. Eight production and four dev dependencies qualify. `wanted` is what the declared range will accept today.

| Package | Declared as | Current | Wanted | Latest | Majors |
|---|---|---:|---:|---:|---:|
| `@noble/curves` | production | 1.9.1 | 1.9.1 | 2.4.0 | 1 |
| `@noble/hashes` | production | 1.8.0 | 1.8.0 | 2.4.0 | 1 |
| `@sentry/node` | production | 10.63.0 | 10.75.3 | 11.1.0 | 1 |
| `@sentry/react` | production | 10.63.0 | 10.75.3 | 11.1.0 | 1 |
| `@tanstack/react-table` | production | 8.21.3 | 8.21.3 | 9.2.4 | 1 |
| `nanoid` | production | 5.1.16 | 5.1.16 | 6.0.1 | 1 |
| `shiki` | production | 3.23.0 | 3.23.0 | 4.4.3 | 1 |
| `undici` | production | 7.29.0 | 7.29.0 | 8.11.2 | 1 |
| `@types/node` | dev | 24.10.2 | 24.10.2 | 26.6.3 | 2 |
| `typescript` | dev | 5.9.3 | 5.9.3 | 7.0.2 | 2 |
| `@testing-library/jest-dom` | dev | 6.6.3 | 6.9.1 | 7.0.1 | 1 |
| `vitest` | dev | 4.1.9 | 4.1.9 | 5.0.2 | 1 |

Sentry can move to `10.75.3` inside `^10.63.0` without taking major 11. Shiki's wanted version stays on 3 because both the dependency and the overrides are `^3.23.0`. Undici's wanted version stays on `7.29.0` because the spec is exact; `7.30.0` is the advisory fix and `8.11.2` is a separate major.

These `0.x` packages are not a major-number bump. Semver still treats the next minor as breaking, and `^0.38.0` does not include `0.39.0`, which is why `wanted` equals `current`:

| Package | Current | Latest |
|---|---:|---:|
| `@tanstack/ai` | 0.38.0 | 0.63.0 |
| `@convex-dev/aggregate` | 0.2.2 | 0.3.1 |
| `@convex-dev/rate-limiter` | 0.3.2 | 0.4.0 |
| `http-message-sig` | 0.2.0 | 0.3.0 |

Largest same-major production lags inside an open range include `posthog-js` `1.398.2` → `1.434.17`, `lucide-react` `1.21.0` → `1.48.0`, and `ai` `7.0.44` → `7.0.122`.

## Unused direct dependencies

A package counts as unused when no import specifier, npm script, Vitest environment, or required peer edge references it. Docs mentions were ignored.

| Package | Kind | Evidence |
|---|---|---|
| `@rjsf/validator-ajv8@6.8.0` | production | Only `package.json:94`. The playground does not use it. `playgroundValidator` is a local `ValidatorType` at `src/components/ae/market/directory-tool-input.ts:78`, passed from `DirectoryToolPlayground.tsx:72`. It is not a peer of `@rjsf/shadcn` or `@rjsf/utils`. |
| `react-resizable-panels@^4.12.3` | production | Only `package.json:129`. No import in source, tests, tools, or scripts. |
| `aislop@0.15.0` | dev | Only `package.json:156`. Bins `aislop`, `aislop-mcp`, and `aislop-tools` are not referenced by scripts or workflows. |

Kept, even though a naive import search misses them:

- `@rjsf/core` has no application import. `@rjsf/shadcn` imports it (`node_modules/@rjsf/shadcn/src/Form/Form.tsx:3`) and declares it as a required peer. The app imports `@rjsf/shadcn` at `DirectoryToolPlayground.tsx:1` and `@rjsf/utils` at `directory-tool-input.ts:2`.
- `@testing-library/dom` has no direct import. It is a required peer of `@testing-library/react`, which tests import.
- `@types/node`, `@types/react`, `@types/react-dom`, and `@types/proper-lockfile` are ambient typings, not import specifiers.
- `jsdom` is the Vitest environment (`@vitest-environment jsdom` across component tests) and is current.
- `react-doctor` is the `doctor` script (`package.json:69`).
- `yaml` is imported only by `tests/unit/release/green-release-baseline.test.ts:5`, but it is declared in `dependencies`, so the production install carries a test parser.
- `@ai-sdk/provider-utils` is imported only from `tests/deploy-smoke/chat-anonymous-streaming-smoke.spec.ts` and `tests/unit/server/mcp-api-harness.ts`. It also remains in the production tree because `ai` depends on it, and that edge is what pulls the extra `undici` parent.

## Licences of production dependencies

Direct production `license` fields on the installed packages:

| Licence | Packages |
|---|---:|
| MIT | 45 |
| Apache-2.0 | 20 |
| ISC | 2 (`lucide-react@1.21.0`, `yaml@2.9.0`) |
| (Apache-2.0 AND MIT) | 1 (`posthog-js@1.398.2`) |
| field missing | 1 (`@formance/formance-sdk@7.0.0`) |

Apache-2.0 AND MIT is still permissive. ISC is permissive. No direct production dependency is GPL, AGPL, LGPL, SSPL, BUSL, MPL, or `UNLICENSED`.

`@formance/formance-sdk` is the vendored tarball at `package.json:84` (`vendor/formance-formance-sdk-7.0.0.tgz`, 908K, lockfile integrity `sha512-zvNBrSB547CsUJ+…`). Its `package.json` has no `license` field. `node_modules/@formance/formance-sdk/LICENSE` is the MIT licence, copyright 2023 Formance, Inc.

In the walked production tree, the non-permissive licence is **MPL-2.0** on `lightningcss@1.32.0` and its optional platform binaries, via `@tanstack/react-start` → `@tanstack/react-start-rsc` → `@tanstack/start-plugin-core`. MPL-2.0 is file-level weak copyleft, not an app-wide GPL obligation. `dompurify@3.4.14` (under `posthog-js`) is `(MPL-2.0 OR Apache-2.0)`, so Apache-2.0 is enough. `json-schema@0.4.0` is `(AFL-2.1 OR BSD-3-Clause)`, both permissive. `@ag-ui/core@0.0.52` (under `@tanstack/ai`) also omits the `license` field; its `LICENSE` file is MIT.

A lockfile scan for GPL, AGPL, LGPL, SSPL, BUSL, and Commons Clause found no third-party match. The only `UNLICENSED` entry is the workspace itself: `packages/cli` `license` is `UNLICENSED` while `publishConfig.access` is `public` (`packages/cli/package.json:22-25`). Dev-only `react-doctor@0.7.7` says `SEE LICENSE IN LICENSE`; that file is a modified MIT licence. It is not in the production tree.

## Packages pinned to a prerelease

| Pin | Where | Installed | Latest seen by `npm outdated` |
|---|---|---|---|
| `npm:nitro-nightly@3.0.1-20260628-090458-3df69609` | devDependency, `package.json:161` | `3.0.1-20260628-090458-3df69609` | nightly `3.0.1-20260928-103646-f72e2ba6` |

That is the only direct prerelease pin. `vite.config.ts:7` imports `nitro/vite`. The release-integrity check compares the installed nightly to this spec (`tools/release/release-integrity.ts:54-70`). The package is dev-only (`license` MIT) and was outside `npm audit --omit=dev`. The installed nightly is the 28 June 2026 build; the latest nightly from this run is 28 September 2026.

No production dependency spec is a prerelease, dist-tag, git URL, or `0.0.0` placeholder. The Formance spec is a `file:` pin of a stable `7.0.0` tarball, not a prerelease.

Two prerelease versions are installed transitively from exact `@tanstack/react-start@1.168.26`, not from a root pin:

- `gensync@1.0.0-beta.2`, via Start → Babel.
- `h3-v2@2.0.1-rc.20`, via `@tanstack/start-server-core`.

## Outside the root audit

These manifests are not in the root workspace, so the counts above do not include them:

- `tools/release/package5-reference-provider/` has its own `package-lock.json` and five exact dependencies (`@modelcontextprotocol/sdk@1.30.0`, `@x402/core`, `@x402/evm`, `@x402/extensions` at `2.23.0`, `zod@4.4.3`). The MCP SDK pin matches the root, so the same SDK advisory chain applies when that tree is installed.
- `.deepsec/pnpm-lock.yaml` and the Claude skill `bun.lock` files are separate tool installs, not the app graph.
