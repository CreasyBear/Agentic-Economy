# Coding Conventions

**Analysis Date:** 2026-07-07

## Naming Patterns

**Files:**
- Use descriptive lower-kebab filenames for non-component modules: `src/modules/registry/registry.actions.ts`, `src/modules/harness/tool-contract.ts`, `src/modules/security/source-write-admission.ts`.
- Use PascalCase only for files that export React components or component adapters: `src/components/astryx/RouterLink.tsx`.
- Domain modules use a fixed file shape:
  - `src/modules/<domain>/public.ts` for the public seam.
  - `src/modules/<domain>/<domain>.functions.ts` for TanStack server functions and source adapters.
  - `src/modules/<domain>/<domain>.actions.ts` for `defineAction` declarations.
  - `src/modules/<domain>/internal/*` for private implementation.
- Tests mirror concern and layer under `tests/unit/<domain>`, `tests/integration`, `tests/imports`, `tests/copy`, `tests/seo`, `tests/types`, `tests/e2e`, and `tests/deploy-smoke`.

**Functions:**
- Use lower-camel verb phrases: `listActions`, `findAction`, `readPublicRegistrySearchPage`, `validatePublicOwnerClaimFlowInput`.
- Use `handle*Request` for route-handler seams exported from route files: `handleListBusinessesRequest` in `src/routes/api.businesses.ts`, `handleSearchBusinessesRequest` in `src/routes/api.businesses.search.ts`.
- Use `*Server` for TanStack server-function exports consumed by routes, and `*ThroughSource` for functions that bind source adapters.
- Prefer domain verbs already used in the repo: `create`, `read`, `submit`, `resolve`, `build`, `validate`, `sync`, `retry`, `normalize`, `record`, `publish`, `claim`.

**Variables:**
- Use exact domain names over generic abbreviations: `sourceWriteRequest`, `agentToolAdmission`, `publicBusinessCatalogApiDtoOutputSchema`.
- Preserve environment variable names exactly when documenting or reading configuration, but never include secret values: `.env.example`, `docs/ONBOARDING.md`.
- Prefer `const` tuples for closed values: `ClaimStatusValues`, `PublicStatusValues`, `TrustTierValues` in `src/modules/business/public.ts`.

**Types:**
- Closed domains are modeled as `*Values` const tuple + derived union + runtime schema. `tests/types/domain-contracts.test.ts` asserts `ClaimStatusValues` / `ClaimStatus` / `ClaimStatusSchema`, `IndexStatus` / `IndexStatusSchema`, and related contracts stay aligned.
- Avoid TypeScript `enum`; use literal unions and Zod schemas.
- Do not use broad `status: string` result fields in runtime/domain contracts. `tests/imports/ts-standards.test.ts` scans for broad status strings.
- Expected outcomes should be discriminated result unions, usually `{ kind: 'ok' | 'error', code, ... }` through `src/modules/common/result.ts`, or domain-specific discriminants such as `kind: 'found' | 'not_found'` in `src/modules/registry/registry.actions.ts`.

## Code Style

**Formatting:**
- No committed Prettier or ESLint config was detected. `docs/CONTRIBUTING.md` and `CLAUDE.md` state that `npm run typecheck` plus guardrail tests are the enforcement layer.
- Match existing style manually:
  - 2-space indentation.
  - Single quotes.
  - No semicolons.
  - Trailing commas in multiline objects, arrays, and call arguments.
  - Blank line between external imports and internal/relative imports.
- `tsconfig.json` enables strict TypeScript with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `isolatedModules`, and `forceConsistentCasingInFileNames`.

**Linting:**
- Not detected: `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `prettier.config.*`, and `biome.json`.
- Use executable guardrails instead:
  - `npm run typecheck` for whole-program TypeScript.
  - `npm run test:ts-standards` for explicit `any`, `as any`, `as unknown as`, non-null assertions, `v.any()`, broad status strings, and client-exposed source-write secrets.
  - `npm run test:imports` for backup/private/route-boundary imports.
  - `npm run test:copy` for public and assistant-visible language.

## Import Organization

**Order:**
1. Node built-ins and external packages: `node:fs`, `vitest`, `zod`, `@tanstack/ai`.
2. Internal aliases from `@/` or `~/`: `@/modules/actions`, `@/modules/registry/public`.
3. Relative imports: `./scan-targets`.

**Path Aliases:**
- `@/*` and `~/*` both resolve to `./src/*` in `tsconfig.json`.
- Route aliases map owner/admin operator paths: `@/routes/owner.*`, `@/routes/admin.*`, and `@/routes/developers.discovery`.
- `vite.config.ts` and `vitest.config.ts` both use `tsconfigPaths: true`.

**Module Boundaries:**
- Routes may import public module seams and route-facing function seams, but not module internals. `tests/imports/route-boundary.test.ts` scans `src/routes`.
- Sibling modules and routes must not import another module's `internal/*`; use `src/modules/<domain>/public.ts`. `tests/imports/private-imports.test.ts` enforces this.
- App/runtime code must not import `.planning` or backup paths. `tests/imports/backup-imports.test.ts` owns that scanner.
- Convex schema composition is the special case: `convex/schema.ts` composes module-owned schema fragments such as `src/modules/registry/internal/schema.ts`.

## Error Handling

**Patterns:**
- Use Zod `.strict()` input schemas at boundaries. `src/modules/registry/registry.actions.ts` uses `.strict()` on `registrySearchInputSchema`, `registryDetailInputSchema`, and output object schemas.
- Use `.safeParse` for untrusted request input and `.parse` only for trusted internal assertions or test fixtures.
- Expected domain outcomes return typed unions rather than throwing. `src/modules/common/result.ts` exposes `ok()` and `error()` helpers with `retryable` on error results.
- Throw `Error` for programmer faults, impossible states, or configuration faults, not for ordinary user/domain refusals.
- Public assistant writes fail closed through explicit result/error codes. `src/routes/api.agent.tools.ts` and `src/modules/harness/tool-contract.ts` separate unsigned identity, unverified identity, missing write scope, and admission refusal.

## Logging

**Framework:** Sentry/PostHog plus internal evidence/event sinks; console is not the main observability contract.

**Patterns:**
- Use observability modules for product/runtime events: `src/modules/observability/public.ts`, `src/modules/observability/funnel.functions.ts`, and tests under `tests/unit/observability`.
- Harness runs should emit replayable evidence through `src/modules/harness/evidence-envelope.ts`, `src/modules/harness/session-journal.ts`, and related projections, not ad hoc console logs.
- Audit and redaction behavior is tested in `tests/unit/observability/audit-redaction.test.ts`.
- Do not log secrets, source-write keys, provider tokens, raw private owner fields, or signature material.

## Comments

**When to Comment:**
- Use comments to document load-bearing boundaries, not obvious assignments. Good examples are `src/modules/common/action.ts` explaining action registration and `vite.config.ts` explaining the Vercel Node serverless Nitro preset.
- Keep public-facing strings separate from engineer comments; action `summary` and `boundaries` are assistant-visible copy, not internal comments.

**JSDoc/TSDoc:**
- Use JSDoc on core abstractions and public contracts: `src/modules/common/action.ts` documents `ActionContext`, `ActionDefinition`, `readOnly`, and registration.
- Prefer short domain comments over long speculative explanations inside leaf code.

## Function Design

**Size:** Keep route handlers thin and domain logic in modules. Route tests such as `tests/integration/registry-api.test.ts` call exported handler seams with real `Request` objects.

**Parameters:** Prefer single options objects for multi-field domain operations, especially at source/route boundaries. Trim and normalize input before handing it to lower layers, as in `registrySearchAction.run` in `src/modules/registry/registry.actions.ts`.

**Return Values:** Return exact typed results with discriminants and precise schema coverage. Every `ActionDefinition` must carry `schema`, `outputSchema`, `parameters`, `readOnly`, and `surfaces` through `src/modules/common/action.ts`.

## Module Design

**Exports:**
- Export public domain behavior from `public.ts` only. `src/modules/registry/public.ts`, `src/modules/inquiries/public.ts`, and `src/modules/security/public.ts` are the import seams for routes and sibling modules.
- Register operations explicitly in `src/modules/actions/index.ts`; do not rely on side-effect imports because production bundlers can tree-shake them.
- Action ids are stable dot-namespaced strings such as `registry.search`, `registry.detail`, and `inquiry.submit`.

**Barrel Files:**
- Use module-local barrels (`public.ts`) as ownership seams, not repo-wide barrels.
- `src/modules/actions/index.ts` is the explicit action registry and the place to assert unique action ids.

## Product Copy Conventions

**Public Truth:**
- `PRODUCT.md` Layer 3 wins for anything a person or assistant can read. `CLAUDE.md`, `docs/CONTRIBUTING.md`, and `.agents/skills/ae-public-copy-guardrails/SKILL.md` all point to this authority order.
- AE publishes business-supplied service pages and qualified inquiries. Do not imply booking, payment, dispatch, live availability, marketplace liquidity, or autonomous fulfillment.
- Use "verified" only with a named standard and evidence wording. Otherwise use checked/supplied/published/last checked/needs confirmation.
- State limitations once, as a clean fact, at the contract point. Do not repeat missing capabilities as personality.

**Banned Public/Assistant Vocabulary:**
- Public human copy and assistant-visible action descriptors must avoid internal architecture terms listed in `docs/CONTRIBUTING.md` and `.agents/skills/ae-public-copy-guardrails/SKILL.md`: `source-owned`, `readback`, `manifest`, `capability`, `gateway`, `operator`, `MCP`, `OpenAPI`, `callable`, `autonomous`, `agent-native`, `DTO`, `fixture`.
- `tests/copy/pm05-trust-language-gate.test.ts`, `tests/copy/phase1-banned-copy.test.ts`, `tests/copy/discovery-overclaim.test.ts`, and `tests/copy/scope3-handshake-banned-copy.test.ts` enforce the copy contract over real source.

## UI and Design Conventions

**Authority:**
- `DESIGN.md` is the visual/UI authority. `.agents/skills/ae-design-system/SKILL.md` summarizes the same rules.
- Astryx is the component layer: `@astryxdesign/core` and `@astryxdesign/theme-neutral`.
- Providers are wired once in `src/routes/__root.tsx`; internal navigation goes through `src/components/astryx/RouterLink.tsx`.

**Implementation Rules:**
- Use Astryx first. Use Tailwind 4 only as layout glue through semantic classes such as `text-primary`, `bg-surface`, `bg-card`, `bg-body`, `border-border`, `rounded-md`, and `shadow-sm`.
- Do not add new bespoke `Ae*` presentation components, shadcn/radix/cva wrappers, new handwritten CSS files, font packages, raw route-local palettes, purple gradients, glass, blobs, or generic icon grids.
- `src/styles/globals.css` owns the Astryx theme bridge and token overrides. `src/styles/legacy.css` is retiring and should shrink.
- UI changes should consider loading, empty, error, keyboard/focus, responsive, and reduced-motion states.

## Security and Boundary Conventions

**Auth and Authority:**
- Signed agent identity is attribution/quota/audit only; it never authorizes a verb. The identity/authorization split is documented in `.agents/skills/ae-agent-identity-and-mandates/SKILL.md`.
- Browser input must not supply actor, owner/admin identity, money fields, receipt status, or authorization. Authority comes from Clerk/Convex identity, source rows, and source-write admission.
- Public quiet-agent writes are gated: `inquiry.submit` is the only assistant-exposed write, and it requires Web Bot Auth identity plus write admission before execution.

**Convex:**
- Read `convex/_generated/ai/guidelines.md` before Convex edits.
- Add tables to module-owned schema fragments and compose them in `convex/schema.ts`.
- Keep Node built-ins out of shared Convex import graphs. Node-only Convex actions require a dedicated `"use node"` file that exports actions only, as documented in `.agents/skills/ae-convex-guardrails/SKILL.md`.

## Docs and Planning Conventions

**Authority Docs:**
- `CLAUDE.md` is present and says to read `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/CONTRIBUTING.md`, and `docs/ONBOARDING.md` before non-trivial work.
- `AGENTS.md` was not present as a live file during this scan, even though the prompt supplied AGENTS instructions and repo docs reference the file. Treat the prompt instructions as active for this run and record the file absence as a source discrepancy.
- `docs/CONTRIBUTING.md` is the daily guardrail digest.
- `docs/ONBOARDING.md` documents setup, environment variable names, and the verification ladder.

**Planning Docs:**
- `.planning/` constrains and records work but is not runtime authority.
- App/runtime code must not import `.planning` artifacts; `tests/imports/backup-imports.test.ts` enforces this.
- Refresh `.planning/codebase/*.md` after substantial changes to module ownership, conventions, structure, testing, integrations, or concerns.

---

*Convention analysis: 2026-07-07*
