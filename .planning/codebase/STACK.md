# STACK.md

**Analysis Date:** 2026-09-01

## Runtime & Toolchain

| Item | Value | Source |
|---|---|---|
| Node | `22.x` (engines); `.nvmrc` = `22` | `package.json:engines`, `.nvmrc` |
| Package manager | `npm@11.5.1` | `package.json:packageManager` |
| TypeScript | `5.9.3` | `package.json devDependencies` |
| Workspaces | `packages/cli` only | `package.json:workspaces` |
| Module system | ESM (`"type": "module"`, `sideEffects: false`) | `package.json` |

### tsconfig.json (verbatim compilerOptions)
```json
{
  "target": "ES2022",
  "useDefineForClassFields": true,
  "lib": ["DOM", "DOM.Iterable", "DOM.AsyncIterable", "ES2024"],
  "allowJs": false,
  "skipLibCheck": true,
  "esModuleInterop": true,
  "allowSyntheticDefaultImports": true,
  "strict": true,
  "exactOptionalPropertyTypes": true,
  "noUncheckedIndexedAccess": true,
  "useUnknownInCatchVariables": true,
  "noImplicitOverride": true,
  "forceConsistentCasingInFileNames": true,
  "module": "ESNext",
  "moduleResolution": "Bundler",
  "ignoreDeprecations": "5.0",
  "resolveJsonModule": true,
  "isolatedModules": true,
  "noEmit": true,
  "jsx": "react-jsx",
  "paths": {
    "@/routes/owner.*": ["./src/routes/_operator/owner.*"],
    "@/routes/admin.*": ["./src/routes/_operator/admin.*"],
    "@/routes/developers.discovery": ["./src/routes/_operator/developers.discovery"],
    "@/*": ["./src/*"],
    "~/*": ["./src/*"]
  },
  "types": ["vite/client", "node"]
}
```
Include covers `src/**`, `convex/**`, `tests/**`, config files; excludes `node_modules`, `dist`, `convex/_generated`.

## Frameworks & Libraries (exact versions)

### dependencies (key ones)
| Library | Version | Role |
|---|---|---|
| react / react-dom | `19.2.7` | UI |
| @tanstack/react-start | `1.168.26` | SSR framework |
| @tanstack/react-router | `1.170.16` | Routing |
| @tanstack/react-table | `^8.21.3` | Data tables |
| @tanstack/ai | `^0.38.0` | TanStack AI package |
| convex | `1.45.0` | Backend platform |
| @convex-dev/workpool | `0.4.10` | Registered component (durable work) |
| @convex-dev/rate-limiter | `^0.3.2` | Registered component |
| @convex-dev/agent | `0.7.1` | Registered component (chat/agent) |
| @convex-dev/aggregate | `^0.2.2` | Registered component ×6 instances |
| convex-helpers | `^0.1.123` | Helpers |
| ai (Vercel AI SDK) | `^7.0.44` | Model transport |
| @openrouter/ai-sdk-provider | `^3.0.0` | OpenRouter provider |
| @ai-sdk/provider-utils | `^5.0.16` | AI SDK utils |
| @clerk/tanstack-react-start | `1.5.9` | Auth |
| @clerk/shared | `4.30.2` | Auth shared |
| stripe | `^22.5.0` | Server SDK |
| @stripe/stripe-js | `^9.13.0` | Browser SDK |
| @stripe/react-stripe-js | `^6.8.1` | React Elements |
| @coinbase/cdp-sdk | `1.55.0` | x402 payer custody |
| @x402/core / @x402/evm / @x402/extensions | `2.23.0` | x402 protocol |
| viem | `2.55.2` | EVM |
| @modelcontextprotocol/sdk | `1.30.0` | MCP server + client |
| @sentry/node / @sentry/react | `^10.63.0` | Error tracking |
| posthog-node / posthog-js | `^5.39.0` / `^1.398.2` | Analytics |
| tailwindcss | `^4.3.1` | Styling (v4) |
| zod | `4.4.3` | Validation |
| radix-ui | `^1.6.7` (+ individual radix pkgs) | Primitives |
| lucide-react | `^1.21.0` | Icons |
| recharts | `^3.8.0` | Charts |
| shiki | `^3.23.0` | Syntax highlighting |
| sonner | `^2.0.7` | Toasts |
| cmdk | `^1.1.1` | Command menu |
| class-variance-authority / clsx / tailwind-merge | `^0.7.1` / `2.1.1` / `3.6.0` | Styling utils |
| tw-animate-css | `1.4.0` | Animations |
| openapi-fetch | `0.17.0` | HTTP client |
| @apidevtools/json-schema-ref-parser | `^11.0.0` | OpenAPI normalization |
| @cfworker/json-schema | `4.1.1` | Schema validation in Convex |
| @noble/curves / @noble/hashes | `1.9.1` / `1.8.0` | Crypto |
| http-message-sig | `0.2.0` | Web message signatures (WBA) |
| undici | `7.29.0` | HTTP |
| es-toolkit | `^1.50.0` | Utils |
| nanoid / @sindresorhus/slugify / yaml | `^5.1.16` / `^3.0.0` / `2.9.0` | Utils |
| @vercel/oidc | `3.2.0` | Vercel OIDC (secrets plane) |

### devDependencies
| Tool | Version |
|---|---|
| vite | `8.2.2` |
| @vitejs/plugin-react | `6.0.3` |
| @tailwindcss/vite | `4.3.1` |
| nitro | `npm:nitro-nightly@3.0.1-20260628-090458-3df69609` |
| vitest | `4.1.9` |
| @playwright/test | `1.61.1` |
| oxlint | `^1.80.0` (+ `@nkzw/oxlint-config ^2.0.0`) |
| convex-test | `0.0.56` |
| tsx | `^4.20.5` |
| @sentry/vite-plugin | `^5.3.0` |
| react-doctor | `^0.7.7` |
| aislop | `0.15.0` |
| jsdom | `29.1.1` |
| @testing-library/react / dom | `^16.3.2` / `^10.4.1` |
| esbuild | `0.27.0` |
| @types/node | `24.10.2` |

Note: `overrides` pins `axios@1.18.1` under `@coinbase/cdp-sdk` and the shiki family.

## Fonts (src/styles/globals.css @import lines)
```css
@import "@fontsource-variable/host-grotesk";
@import "@fontsource-variable/azeret-mono";
@import "@fontsource/aleo/300.css";
@import "@fontsource/aleo";
```
Packages present in deps: `@fontsource-variable/host-grotesk`, `@fontsource-variable/azeret-mono`, `@fontsource/aleo` (+ unused-in-globals but installed: `@fontsource-variable/inter`, `@fontsource/dm-mono`, `@fontsource/geist-pixel`). Layer order declared: `@layer reset, theme, base, clerk, components, utilities` (globals.css:8).

## Build / Dev Pipeline (real npm scripts, quoted)

| Script | Command |
|---|---|
| `dev` | `"vite dev --host 127.0.0.1"` |
| `dev:local` | `"node tools/dev/local-dev.mjs"` |
| `build` | `"vite build"` |
| `typecheck` | `"tsc --noEmit"` |
| `lint` | `"oxlint src convex tests tools --deny-warnings"` |
| `generate:convex` | `"node tools/dev/require-supported-node.mjs -- convex codegen --typecheck=disable"` |
| `check:convex-codegen` | `"node tools/dev/require-supported-node.mjs -- convex codegen --dry-run --typecheck=disable"` |
| `seed:dev` | `"convex run devSeed:seedDevCatalog"` |
| `test` | `"node tools/dev/run-with-cleanup.mjs vitest run"` |
| `test:unit` | `"node tools/dev/run-with-cleanup.mjs vitest run tests/unit"` |
| `test:integration` | `"node tools/dev/run-with-cleanup.mjs vitest run tests/integration convex --no-file-parallelism"` |
| `test:e2e` | `"node tools/dev/run-with-cleanup.mjs playwright test tests/e2e"` |
| `test:e2e:a11y` | `"node tools/dev/run-with-cleanup.mjs playwright test tests/e2e/a11y --workers=1"` |
| `test:e2e:authenticated:required` | `"AE_REQUIRE_AUTHENTICATED_E2E=true node tools/dev/run-with-cleanup.mjs playwright test --config=playwright.authenticated.config.ts"` |
| `test:imports` | build CLI then `AE_SCAN_MODE=clean node tools/dev/run-listed-vitest.mjs tests/imports/module-boundaries.test.ts ...` (11 boundary suites) |
| `test:release` | `"npm run test:release:source"` → verify:deployment-manifest → test:conformance → test:chat:conformance → verify:convex-generated:anonymous → verify:release-integrity → after-codegen chain |
| `test:release:source:after-codegen` | architecture tests → `lint` → `typecheck` → unit → integration → types → imports → ts-standards → seo → ui-contract → e2e → e2e:a11y → cli-package → `build` |
| `smoke:gateway:production` | `"node tools/dev/run-with-cleanup.mjs tsx tools/release/operation-gateway-production-smoke.ts"` |
| `pack:cli:public` | `"npm run build:cli && npm pack ./packages/cli --pack-destination ./public/downloads"` |
| `doctor` | `"npm exec --offline -- react-doctor"` |
| `ae` | `"tsx tools/ae/cli.ts"` |
| `parity:check` / `audit:actions` | `node eval/parity/check-parity.mjs` / `node scripts/audit-action-surfaces.mjs` |

### tools/dev/local-dev.mjs role
One-command local stack supervisor (425 lines): asserts Node 22 (`assertSupportedNode` throws otherwise, local-dev.mjs:54-62), selects the local Convex deployment (`convex deployment select local`) and runs `convex dev --typecheck disable --local-force-upgrade`, then launches Vite with `['--port','3024','--strictPort','--host','127.0.0.1']` (local-dev.mjs:10). Waits for readiness patterns `/Convex functions ready!/u` and `/\bLocal:\s+https?:\/\//u` (local-dev.mjs:12-13), configures local source-write secret + Convex server-function token via `tools/dev/local-source-write-secret.mjs`, supervises both children with process-tree signal handling and a 120s startup timeout.

### packages/cli workspace
`packages/cli` is `@agentic-economy/cli` v0.1.0 — "Compiled Agentic Economy catalogue, invocation, and receipt client", `bin: { ae: "dist/ae.js" }`, engines `node >=20`, built via `../../scripts/build-cli.mjs`, packed into `public/downloads` for public download. The in-repo dev CLI is `npm run ae` → `tsx tools/ae/cli.ts`.

## Vitest / Playwright config surface
- Vitest suites organized as `tests/unit`, `tests/integration`, `convex` (component tests), `tests/types`, `tests/imports` (architecture boundary scans), `tests/seo`, `tests/ui-contract`, `tests/eval`, `tests/e2e` (Playwright).
- Convex codegen gating: all Convex commands wrapped by `tools/dev/require-supported-node.mjs` (Node 22 enforcement).
