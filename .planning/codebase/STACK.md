# Technology Stack

**Analysis Date:** 2026-06-30

## Languages

**Primary:**
- TypeScript 6.0.3 - application, server functions, Convex functions, tests, and build config in `src/`, `convex/`, `tests/`, `vite.config.ts`, `vitest.config.ts`, and `playwright.config.ts`.
- TSX / React JSX - route components and UI components in `src/routes/*.tsx`, `src/components/**/*.tsx`, and `src/router.tsx`.

**Secondary:**
- CSS - global design system, answer UI, and token implementation in `src/styles/globals.css`, `src/styles/answer.css`, and `src/styles/tokens.css`.
- YAML - Promptfoo eval configuration in `eval/answer/promptfooconfig.yaml`.
- JSON - package metadata and tool config in `package.json`, `package-lock.json`, `components.json`, `tsconfig.json`, and `convex/tsconfig.json`.
- JavaScript - generated Convex artifacts in `convex/_generated/*.js`; do not edit generated files directly.

## Runtime

**Environment:**
- Node.js - local runtime observed as `v26.4.0`; no `.nvmrc` or `.node-version` file is present.
- ESM - `package.json` sets `"type": "module"`.
- Browser + server runtime - TanStack Start route handlers and server functions run through Vite/Nitro in `vite.config.ts` and `src/start.ts`.
- Convex runtime - Convex queries/mutations run from `convex/*.ts` with schema composition rooted at `convex/schema.ts`.

**Package Manager:**
- npm 11.5.1 declared by `package.json` via `"packageManager": "npm@11.5.1"`.
- Local npm observed as `11.17.0`.
- Lockfile: present (`package-lock.json`, lockfileVersion 3).

## Frameworks

**Core:**
- React 19.2.7 - UI components and routes in `src/components/`, `src/routes/`, and `src/router.tsx`.
- React DOM 19.2.7 - browser rendering dependency declared in `package.json`.
- TanStack React Start 1.168.26 - full-stack route/server runtime configured in `vite.config.ts` and `src/start.ts`; server functions use `createServerFn` throughout `src/modules/**/*.functions.ts`.
- TanStack React Router 1.170.16 - file routes in `src/routes/`, generated route tree in `src/routeTree.gen.ts`, and router setup in `src/router.tsx`.
- Convex 1.42.0 - source database, typed queries/mutations, codegen, and schema in `convex/` plus server bridge helpers in `src/lib/server/convex-source.ts`.
- Clerk TanStack React Start 1.4.9 - auth provider and middleware in `src/start.ts`, `src/routes/__root.tsx`, `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, and `src/lib/server/claim-owner-session.ts`.
- Tailwind CSS 4.3.1 - Vite plugin in `vite.config.ts`, content config in `tailwind.config.ts`, and CSS variables in `src/styles/tokens.css`.
- Nitro nightly 3.0.1 alias - Vite/Nitro integration via `nitro/vite` in `vite.config.ts`.

**Testing:**
- Vitest 4.1.9 - unit, integration, type, import, copy, SEO, and UI-contract tests configured by `vitest.config.ts`.
- Playwright 1.61.1 - E2E, accessibility, deploy, and provider smoke tests configured by `playwright.config.ts` and `playwright.deploy-smoke.config.ts`.
- Testing Library React 16.3.2 and jest-dom 6.9.1 - component-oriented test support from `package.json`.
- Promptfoo 0.120.3 - answer gate/follow-up evals configured by `eval/answer/promptfooconfig.yaml`.

**Build/Dev:**
- Vite 8.1.0 - dev/build server configured in `vite.config.ts`.
- `@vitejs/plugin-react` 6.0.3 - React transform plugin in `vite.config.ts`.
- `@tailwindcss/vite` 4.3.1 - Tailwind plugin in `vite.config.ts`.
- `vite-tsconfig-paths` 6.1.1 - installed but `vite.config.ts` uses Vite's `resolve.tsconfigPaths: true`.
- Convex CLI through `convex` package - codegen check via `npm run check:convex-codegen`; dev seeding via `npm run seed:dev`.
- `tsx` 4.20.5 - TypeScript script runner dependency in `package.json`.

## Key Dependencies

**Critical:**
- `@tanstack/react-start` 1.168.26 - owns SSR/server functions and middleware in `src/start.ts`.
- `@tanstack/react-router` 1.170.16 - owns route declarations in `src/routes/`.
- `convex` 1.42.0 - owns durable source storage and generated function types in `convex/_generated/`.
- `@clerk/tanstack-react-start` 1.4.9 - owns public auth provider, middleware, and server auth calls in `src/start.ts` and `src/lib/server/convex-source.ts`.
- `zod` 4.4.3 - request/action validators in `src/modules/common/action.ts`, `src/modules/**/*.functions.ts`, and route handlers such as `src/routes/api.answer.follow-up-chips.ts`.
- `@tanstack/ai` 0.38.0 - tool definition helper used by `src/modules/answer/tools/registry-search.tool.ts`.
- `ai` 7.0.8 - chat UI type support used by `src/components/ae/chat/AeAnswerPromptInput.tsx` and `src/components/ai-elements/prompt-input.tsx`.
- `atmn` 1.1.10 - Autumn plan/feature config in `autumn.config.ts`.

**Infrastructure:**
- `radix-ui` 1.6.0 and `@radix-ui/react-use-controllable-state` 1.2.3 - UI primitives in `src/components/ui/`.
- `@shadcn/react` 0.2.0, `shadcn` 4.12.0, and `components.json` - shadcn/radix-nova component conventions and registry configuration.
- `lucide-react` 1.21.0 - icon set used across UI components and routes.
- `sonner` 2.0.7 - toast notifications in `src/components/ui/sonner.tsx` and owner/inquiry routes.
- `class-variance-authority`, `clsx`, and `tailwind-merge` - component styling utilities in `src/lib/utils.ts` and `src/components/ui/`.
- `@fontsource-variable/fraunces`, `@fontsource-variable/hanken-grotesk`, and `@fontsource/ibm-plex-mono` - self-hosted font packages referenced by `src/styles/tokens.css`.
- `streamdown`, `@streamdown/cjk`, `@streamdown/code`, `@streamdown/math`, and `@streamdown/mermaid` - reasoning/markdown rendering in `src/components/ai-elements/reasoning.tsx`.
- `motion` 12.42.0 - animation helper used by `src/components/ai-elements/shimmer.tsx`.
- `nanoid` 5.1.16 - local UI id generation in `src/components/ai-elements/prompt-input.tsx`.

## Configuration

**Environment:**
- `.env.example` and `.env.local` files are present; their contents were not read.
- `.gitignore` ignores `.env`, `.env.*`, `.vercel/`, `.convex/`, `playwright-report/`, `test-results/`, and `coverage/`, while allowing `.env.example`.
- Server-side source writes require `AE_SOURCE_WRITE_SECRET` through `src/lib/server/source-write-admission.ts`.
- Convex server calls require `CONVEX_URL` or `VITE_CONVEX_URL` through `src/lib/server/convex-source.ts`.
- Convex auth requires `CLERK_JWT_ISSUER_DOMAIN` through `convex/auth.config.ts`.
- Local E2E can bypass Clerk with `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`; `src/start.ts` and `src/routes/__root.tsx` throw if this is enabled in production.
- Full provider env names are documented in `.planning/codebase/INTEGRATIONS.md`.

**Build:**
- `package.json`: npm scripts, dependency versions, and npm package manager declaration.
- `tsconfig.json`: strict TypeScript, `moduleResolution: "Bundler"`, React JSX, `@/*` and `~/*` aliases to `src/*`, and `noEmit`.
- `convex/tsconfig.json`: Convex-specific TypeScript config excluding `convex/_generated`.
- `vite.config.ts`: TanStack Start, Nitro, React, and Tailwind Vite plugins; dev server port 3000; tsconfig path resolution.
- `tailwind.config.ts`: Tailwind content globs for `src/**/*.{ts,tsx}` and `tests/**/*.{ts,tsx}`.
- `components.json`: shadcn/radix-nova style, CSS variable mode, lucide icons, aliases, and AI Elements registry.
- `vitest.config.ts`: Node test environment and `tests/**/*.test.{ts,tsx}` include.
- `playwright.config.ts`: local E2E server on `127.0.0.1:3020` with compact/wide Chromium projects.
- `playwright.deploy-smoke.config.ts`: deploy/provider smoke test config with no local web server.
- `autumn.config.ts`: Autumn paid activation feature and monthly plan definition.

## Platform Requirements

**Development:**
- Run `npm install` from `package-lock.json` with npm.
- Use `npm run dev` for TanStack Start/Vite development on `127.0.0.1`.
- Use `npm run typecheck` for TypeScript validation.
- Use `npm run check:convex-codegen` after Convex deployment configuration is available.
- Use `npm run seed:dev` to call `convex run devSeed:seedDevCatalog` and seed catalog fixtures from `src/modules/dev/internal/dev-seed-fixture.ts`.
- Use focused test commands from `package.json`: `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, `npm run test:a11y`, `npm run test:eval`, and provider smoke commands.

**Production:**
- Hosting target: Vercel is inferred from `VERCEL_URL` usage in `src/modules/billing/billing.functions.ts`, Vercel bypass helpers in `tests/deploy-smoke/vercel-bypass.ts`, and local `.vercel/` metadata presence; no committed `vercel.json` is present.
- Server runtime: TanStack Start with Nitro/Vite build output; `.output/` is ignored.
- Durable backend: Convex deployment plus generated function references in `convex/_generated/`.
- Auth: Clerk sessions with Convex token template `convex` via `src/lib/server/convex-source.ts`.
- CI pipeline: Not detected; no `.github/`, `.gitlab/`, `.circleci/`, or `.husky/` workflow files are present.

## Project Skill Constraints

- Convex skills in `.codex/skills/convex-best-practices/SKILL.md` and `.codex/skills/convex-functions/SKILL.md` align with this repo's use of object-form Convex functions, argument validators, return validators, and explicit table names in `convex/*.ts`.
- Clerk skills in `.codex/skills/clerk/SKILL.md` and `.codex/skills/clerk-nextjs-patterns/SKILL.md` map to TanStack Start auth middleware and Clerk provider usage in `src/start.ts` and `src/routes/__root.tsx`.
- TanStack skills in `.codex/skills/tanstack-router/SKILL.md` and `.codex/skills/tanstack-start/SKILL.md` map to file routes in `src/routes/`, server functions in `src/modules/**/*.functions.ts`, and middleware in `src/start.ts`.
- The local AE skill `.agents/skills/submit-qualified-inquiry/SKILL.md` defines the assistant-safe action boundary for `inquiry.submit`, which is implemented through `src/modules/inquiries/inquiry.actions.ts`, `src/modules/actions/index.ts`, and `src/routes/api.agent.tools.ts`.

---

*Stack analysis: 2026-06-30*
