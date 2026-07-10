# Technology Stack

**Analysis date:** 2026-07-10

## Runtime and Language

- **Language:** TypeScript 6.0.3 across application, Convex, scripts, and tests. The root `tsconfig.json` enables strict mode, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, isolated modules, and bundler-style module resolution.
- **JavaScript runtime:** Node.js. Production is explicitly pinned to Vercel Node serverless `nodejs20.x` in `vite.config.ts`; local tooling uses the installed Node/npm toolchain. `@types/node` 24.10.2 supplies development types, but it does not change the production runtime pin.
- **Module format:** Native ESM (`"type": "module"` in `package.json`) targeting ES2022 with DOM libraries.
- **Package manager:** npm 11.5.1, declared in `package.json`, with the reproducible dependency graph in `package-lock.json` (lockfile v3).

## Application Framework

- **Full-stack framework:** TanStack Start 1.168.26, configured through `@tanstack/react-start/plugin/vite` in `vite.config.ts`. Server functions, request middleware, SSR, and file-based routes live under `src/`.
- **Router:** TanStack React Router 1.170.16. The route tree is generated into `src/routeTree.gen.ts`; source routes are in `src/routes/`.
- **UI runtime:** React 19.2.7 and React DOM 19.2.7.
- **Server/build adapter:** Nitro nightly 3 (`nitro-nightly@3.0.1-20260628-090458-3df69609`) with the `vercel` preset and Node entry format in `vite.config.ts`.
- **Build system:** Vite 8.1.0 with `@vitejs/plugin-react` 6.0.3. Development runs on `127.0.0.1:3000` via `npm run dev`; production artifacts are built by `npm run build`.

## Data and Backend

- **Primary durable backend:** Convex 1.42.0. The generated client/server bindings live in `convex/_generated/`; the root schema is composed in `convex/schema.ts`; public Convex functions are exported from files such as `convex/business.ts`, `convex/inquiries.ts`, and `convex/billing.ts`.
- **Application domain layer:** Source-owned domain modules live under `src/modules/`. Each module generally exposes a small public surface and keeps schemas, commands, projections, and provider adapters under `internal/`.
- **Server-to-Convex access:** HTTP/client construction and authenticated source-write behavior are centralized in `src/lib/server/convex-source.ts`. Convex remains authoritative even where an external projection or provider readback exists.
- **Validation:** Zod 4.4.3 at HTTP/application boundaries and Convex validators from `convex/values` at Convex boundaries.
- **Search:** Built-in source search/projections plus an optional Meilisearch mirror. Backend selection (`convex`, `dual`, or `meilisearch`) and the HTTP port are implemented in `src/modules/registry/internal/catalog-search-port.ts`.

## Frontend and Design System

- **Design system:** Astryx packages `@astryxdesign/core` and `@astryxdesign/theme-neutral` 0.1.x. Vite bundles Astryx during SSR because its published ESM uses extensionless imports (`vite.config.ts`).
- **Styling:** Tailwind CSS 4.3.1 through `@tailwindcss/vite`; utility merging uses `tailwind-merge` 3.6.0; animation utilities use `tw-animate-css` 1.4.0.
- **Motion and icons:** Motion 12.42.0 and Lucide React 1.21.x.
- **Tables:** TanStack React Table 8.21.3.
- **AI UI/streaming:** TanStack AI 0.38.0 supports structured answer streaming; the visible chat and artifact components are under `src/components/ae/chat/` and `src/components/ae/artifacts/`.
- **Accessibility approach:** Semantic React/Astryx components plus Playwright accessibility suites under `tests/e2e/a11y/`; there is no separate runtime accessibility dependency.

## Authentication, Trust, and Cryptography

- **Human authentication:** Clerk through `@clerk/tanstack-react-start` 1.4.9. Request middleware is installed in `src/start.ts`; Convex validates Clerk JWTs using `convex/auth.config.ts`.
- **Agent authentication:** Web Bot Auth 0.1.3 and the local verification boundary in `src/modules/clearance/internal/web-bot-auth.ts`. Signature-Agent origins are allowlisted, directory keys are fetched from the standard well-known endpoint, and replay/created-time checks are enforced locally.
- **Protocol contracts:** `handshake-protocol-kernel` 0.4.0 supplies Handshake adapter/protocol types; usages include `src/modules/harness/handshake-adapter.ts` and related agent-facing surfaces.
- **Cryptographic primitives:** Node `crypto`, `@noble/hashes` 1.8.0, and `@noble/curves` 1.9.1 support HMACs, signatures, hashes, and constant-time verification at trust boundaries.
- **HTTP client:** Platform `fetch` plus Undici 7.28.0 where Node HTTP behavior is needed.

## Security and Request Pipeline

- `src/start.ts` composes server observability, security headers, CSRF protection, source-write admission, and Clerk middleware.
- `src/lib/http/security-headers.ts` owns CSP and other response security headers, including explicit provider origins.
- `src/lib/server/bounded-request-body.ts` bounds and parses untrusted request bodies.
- Provider base URLs are checked by `src/modules/security/provider-api-base-url.ts`; production providers are constrained to expected HTTPS hosts, while controlled localhost overrides support non-production tests.
- Sensitive provider credentials are server-only environment variables documented by name in `.env.example`; client-exposed settings use the `VITE_` prefix.

## Observability

- **Errors/traces:** Sentry React/Node 10.63.x, initialized in `src/lib/observability/sentry.client.ts` and `src/lib/observability/sentry.server.ts`. Source-map upload is conditionally enabled by `@sentry/vite-plugin` when build credentials are present.
- **Product analytics:** PostHog via `posthog-js` 1.398.x and `posthog-node` 5.39.x, wrapped by `src/lib/observability/posthog.client.ts` and `src/lib/observability/posthog.server.ts`.
- **Source-owned milestones:** Funnel and activation evidence that must remain product-owned is persisted through `src/modules/observability/` and Convex, rather than treating third-party analytics as authority.
- **Failure isolation:** Observability is optional, can be disabled for local E2E, and provider flush failures do not replace application responses (`src/start.ts`).

## Testing and Quality Toolchain

- **Unit/integration/contract tests:** Vitest 4.1.9 with jsdom 29.1.1 and Testing Library (`vitest.config.ts`, `tests/unit/`, `tests/integration/`, `tests/types/`, `tests/ui-contract/`).
- **Browser and accessibility tests:** Playwright 1.61.1 (`playwright.config.ts`, `playwright.deploy-smoke.config.ts`, `tests/e2e/`, `tests/deploy-smoke/`).
- **AI evaluation:** Promptfoo 0.121.x plus repository-owned coverage/report scripts under `eval/answer/`; `npm run test:eval` is the feature gate for evaluated LLM behavior.
- **Static verification:** `tsc --noEmit`, Convex dry-run code generation, graph-freshness checks, import-boundary tests, copy checks, UI contract checks, and production build. The complete release ladder is encoded in `package.json` as `test:release`.
- **Source execution:** `tsx` 4.20.x runs TypeScript audit/evaluation scripts without a separate build step.

## Deployment and Configuration

- **Hosting target:** Vercel Node serverless, produced by the Nitro Vercel preset in `vite.config.ts`. `.vercel/` contains local project metadata but is not application source.
- **Backend deployment:** Convex is deployed/configured separately and connected using `VITE_CONVEX_URL` / server-side Convex URL variables.
- **Environment contract:** `.env.example` is the current inventory for Clerk, Convex, source-write keys, Web Bot Auth, canonical URLs, billing, notifications, OpenRouter, Meilisearch, Sentry, PostHog, and Google Maps.
- **Generated/build outputs:** `.output/`, route generation, Convex generated bindings, Playwright reports, and evaluation reports are derived artifacts; application source remains in `src/`, `convex/`, `tests/`, and `eval/`.

## Key Version Constraints

- Several foundation packages are exact-pinned (`react`, `react-dom`, TanStack Router/Start, Convex, Clerk, TypeScript, Vite, Vitest, Playwright) to reduce framework drift.
- Astryx, Sentry, TanStack AI/Table, Motion, and development utilities use compatible-range pins and can move within their declared semver ranges on install.
- Nitro is intentionally a dated nightly alias rather than a stable release; changes to it can affect server output and require build/deploy-smoke verification.
- The production Node 20 pin is older than the development Node type package. Code must remain compatible with the runtime declared in `vite.config.ts`, not merely with compile-time Node 24 declarations.

---

*Stack analysis: 2026-07-10*
