# Technology Stack

**Analysis date:** 2026-07-14
**Evidence basis:** current working tree and configuration, not planning claims. The working tree is dirty and its local `main` is not the same revision as `origin/main`; therefore "present in source" and "hosted" are separate statements.

## Runtime topology

| Layer | Current technology | Runtime truth | Authoritative files |
|---|---|---|---|
| Browser | React 19.2.7, TanStack Router, Astryx, Tailwind | Human catalogue, chat, Request workspace, owner/admin UI | `src/routes/`, `src/components/`, `src/routes/__root.tsx` |
| Web/server | TanStack Start 1.168.26 + Nitro nightly on Vite 8.1.0 | SSR and route handlers; Vercel Node serverless output pinned to `nodejs20.x` | `src/start.ts`, `src/routes/`, `vite.config.ts` |
| Durable backend | Convex 1.42.0 | Database, queries, mutations, actions, scheduler and cron; schema is composed from domain modules | `convex/schema.ts`, `convex/*.ts`, `src/modules/*/internal/*schema.ts` |
| AI egress | OpenRouter REST | Required by search-answer synthesis and the V2 Request semantic interpreter; missing credentials fail those paths closed | `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/customer-request/openrouter-transport.ts`, `convex/customerRequestApplication.ts` |
| CI/release | GitHub Actions, Vercel API, Convex CLI | Clean source gate followed by exact-Git-revision Vercel and Convex production deployment and cold Request proof | `.github/workflows/kernel-release-gate.yml`, `tools/release/` |
| Optional edge examples | Cloudflare Workers | Standalone examples only; not the canonical product runtime and not an active routing origin | `examples/routing-edge/`, `examples/routing-agent-directory/` |

The browser and server use ES2022. `tsconfig.json` enables strict mode, exact optional property types, unchecked indexed access, unknown catch variables and bundler module resolution. The web output is Node 20, while GitHub Actions executes the build and release tooling on Node 22. No root `engines` range is declared.

## Languages and source forms

- TypeScript 6.0.3 owns production application, domain, Convex and release behavior under `src/`, `convex/` and TypeScript files in `tools/`.
- TSX owns React routes and components under `src/routes/` and `src/components/`.
- CSS is rooted at `src/styles/globals.css`, which imports the application style layers in `src/styles/`; Tailwind 4 is compiled by Vite.
- JSON, JSONC and YAML configure TypeScript, tests, Promptfoo, Wrangler and GitHub Actions.
- JavaScript ESM and declaration `.mts` files still exist in `examples/` and some `tools/release/` checks. They are support/example artifacts, not the canonical V2 Request application path. Their continued presence is current repository fact, despite the product goal banning them as owners of product behavior.
- `convex/_generated/*.js` and `*.d.ts` are Convex-generated bindings.

## Package and build system

- The root is a private ESM package (`"type": "module"`, `sideEffects: false`).
- npm 11.5.1 is the declared package manager in `package.json`; `package-lock.json` is the frozen CI lockfile. An untracked `pnpm-lock.yaml` is present but is not the declared install authority.
- `npm ci` is the release installation path.
- `npm run dev` starts Vite on `127.0.0.1`; Vite is configured for port 3000.
- `npm run build` produces the TanStack Start/Nitro Vercel artifact.
- `vite.config.ts` bundles Astryx during SSR, adds a local `/SKILL.md` path shim, enables Tailwind and conditionally uploads Sentry source maps only when all build credentials exist.
- `src/routeTree.gen.ts` is generated TanStack Router output from file routes in `src/routes/`.

## Core frameworks

| Concern | Dependency | How it is used |
|---|---|---|
| Full-stack web | `@tanstack/react-start` 1.168.26 | Server handlers, middleware, SSR and client hydration |
| Routing | `@tanstack/react-router` 1.170.16 | File routes plus generated route tree |
| UI | `react` / `react-dom` 19.2.7 | Browser and SSR component runtime |
| Durable state | `convex` 1.42.0 | Typed clients, tables, functions, actions and schedules |
| Design system | `@astryxdesign/core`, `@astryxdesign/theme-neutral` 0.1.2 | Primary components, theme, link and layer providers |
| Styling | `tailwindcss` / `@tailwindcss/vite` 4.3.1 | Layout and utility compilation |
| AI message types | `@tanstack/ai` 0.38.x | Structured answer and harness schemas |
| Table behavior | `@tanstack/react-table` 8.21.x | Operator-facing tables |

## Validation, trust and networking

- Zod 4.4.3 validates HTTP bodies, provider payloads, release readback and imported capability data.
- AJV 8.20.0 and `@cfworker/json-schema` 4.1.1 validate the supported JSON-Schema-compatible capability contract profile.
- `web-bot-auth` 0.1.3, `http-message-sig` 0.2.x and Noble cryptography implement HTTP Message Signature machine identity in the legacy/retired routing seam and signature-directory support.
- `undici` 7.28.0 supplies the guarded Node egress used by Convex capability readiness probes in `convex/capabilitySupplyReadiness.ts`.
- Capability transport admission is production TypeScript in `src/modules/capability-supply/internal/transport-adapters.ts`. Registered adapters are `http-json:v1` and `mcp-jsonrpc:v1`; only public HTTPS endpoints and bounded, adapter-specific inert configuration are admitted.
- Import normalization for direct AE envelopes, OpenAPI 3.1 POST operations, MCP tools and x402 resource metadata is in `src/modules/capability-supply/internal/publication-importers.ts`. x402 payment execution is explicitly unsupported; it normalizes metadata to the generic HTTP adapter only when commercial metadata agrees.

## Product source seams

### Human front doors

- `/` is the answer/chat front door, backed by `src/components/ae/chat/AeHomeComposer.tsx` and answer-thread modules.
- `/engine` is a separate V2 Request workspace backed by `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`.
- `/registry`, `/$slug` and `/$slug/inquiry` expose catalogue, listing and qualified-inquiry journeys.
- Owner/admin routes live under `src/routes/_operator/` and are protected by Clerk/operator checks.

### Request APIs

- Human session endpoints are `/api/requests` and child facts, messages, options, authorization, approval and attempts routes in `src/routes/api.requests*.ts`.
- External-agent endpoints are `/api/v1/requests` and child facts, messages and options routes in `src/routes/api.v1.requests*.ts`.
- Clerk API keys with the Request scope authenticate the external-agent path in `src/lib/server/customer-request-agent-auth.ts`.
- Both surfaces call Convex through typed server adapters under `src/lib/server/customer-request-*.ts` and durable V2 functions under `convex/customerRequest*.ts`.

### Capability graph and execution

- Contract grammar and JSON values: `src/modules/capability-contract/public.ts`.
- Immutable contract documents: `src/modules/capability-contract-registry/` and `convex/capabilityContractDocuments.ts`.
- Businesses, offerings, bindings, publications, eligibility and graph projection: `src/modules/capability-supply/`, `convex/capabilitySupply.ts` and `convex/capabilitySupplyReadiness.ts`.
- Request interpretation/compilation/evaluation: `src/modules/customer-request/` and `convex/customerRequestApplication.ts`.
- Preparation egress dispatches `http-json:v1` and `mcp-jsonrpc:v1` through the single adapter seam in `convex/customerRequestV2PreparationEgress.ts`.
- Approval, action-attempt authority, provider execution evidence and unknown-outcome reconciliation are split across `convex/customerRequestV2ApprovalGrant.ts`, `convex/customerRequestV2ActionAttempt.ts`, `convex/customerRequestV2ProviderExecution.ts` and `convex/customerRequestV2ProviderReconciliation.ts`.
- The previous `/v1/route`, `/v1/execute`, `/mcp` and routing descriptor HTTP origins are hard-retired by `convex/http.ts` and `src/modules/routing-kernel/retirement.ts`; remaining routing-kernel files are not the live public origin.

## Durable data

`convex/schema.ts` composes tables from these active bounded contexts:

- answer threads;
- business ownership and visibility;
- catalogue and registry search projections;
- capability contracts and supply publications;
- V2 customer Requests, preparation, approvals, attempts and provider evidence;
- demand and discovery;
- inquiry threads and notification outbox;
- harness evidence;
- observability/audit;
- security and settings;
- legacy routing-kernel tables retained by the composed schema.

Convex has no SQL migration layer. Backend compatibility is managed through schema/function changes and explicit functions such as `convex/authzMigration.ts`; generated bindings are checked with `npm run check:convex-codegen`. Three hourly cron jobs clean security abuse buckets, inquiry abuse buckets and source-write nonces in `convex/crons.ts`.

## Authentication and authorization stack

- Clerk TanStack Start middleware runs in `src/start.ts`; client provider wrapping is limited to sign-in, sign-up and operator paths in `src/routes/__root.tsx`.
- Convex trusts Clerk JWTs through `convex/auth.config.ts`, with application ID `convex` and a required `CLERK_JWT_ISSUER_DOMAIN`.
- Human server-to-Convex calls obtain a Clerk token with template `convex` in `src/lib/server/convex-source.ts`.
- External agents authenticate with Clerk user API keys, not the retired WBA routing origin, through `src/lib/server/customer-request-agent-auth.ts`.
- Server-originated writes use scoped source-write admission keys and replay nonces implemented by `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts` and `convex/sourceWriteAdmission.ts`.
- The local E2E Clerk bypass is explicit and throws in production builds.

## Testing and release gates

- Vitest 4.1.9 covers unit, integration, type, import-boundary, copy, SEO, UI-contract and evaluation suites.
- Playwright 1.61.1 covers local E2E/accessibility and hosted deployment smoke suites.
- Testing Library, jest-dom and jsdom support component tests; `convex-test` supports backend tests.
- Promptfoo 0.121.17 plus TypeScript evaluation scripts test answer behavior.
- oxlint 1.73.x fails on warnings. TypeScript is no-emit and strict.
- `npm run test:release:source` runs lint, typecheck, routing-edge dry-run, kernel-retirement proof, all focused test groups and a production build.
- `.github/workflows/kernel-release-gate.yml` runs source proof on pushes and pull requests to `main`. On non-PR `main` pushes it then deploys the exact Git revision to Vercel and Convex, seeds labelled sandbox acceptance supply, verifies release readback and runs a cold external-agent Request journey.

## Deployment truth at this refresh

| Status | Evidence |
|---|---|
| Configured | Vercel Node output and exact-source deployment are configured in `vite.config.ts`, `.github/workflows/kernel-release-gate.yml` and `tools/release/deploy-customer-request-git-source.ts`. |
| Source-reachable | Web routes call Convex; V2 Request calls OpenRouter; capability preparation and readiness call registered transport adapters. |
| Hosted-proven | GitHub Actions run `29304983501` completed successfully for `origin/main` revision `aca296db9f4f4f2f5e04d1c8331c64f1b4344960`, including exact Vercel/Convex deployment and cold Request proof. |
| Not hosted-proven | Current dirty working-tree changes and local-only commits, including capability readiness work beyond `origin/main`, are not covered by that hosted proof. |
| Dormant/retired | Cloudflare routing examples and the old Convex routing/MCP origin are not the canonical live Request product path; old Convex routes return `routing_v1_retired`. |

## Development requirements

- Use Node 22 to match CI tooling; expect production server execution on Node 20.
- Use npm 11.5.1 and `npm ci`; do not treat the untracked pnpm lockfile as authoritative.
- Clerk, Convex and OpenRouter configuration are required for the full authenticated Request journey.
- Individual optional integrations require their own credentials and must not be inferred live from variable names.
- Playwright browser binaries are required for browser suites; Wrangler is required only for the routing-edge example check.

---

*Refresh this map after runtime, dependency, deployment or canonical-path changes.*
