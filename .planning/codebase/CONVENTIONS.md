---
last_mapped_commit: b1b105b1e07a46f637f4dcfb33537eaf4dca6bc0
last_mapped_at: 2026-07-29
last_mapped_tree: e6a09cd838ecd86ccb4b6693b5d25a58fc85bddf
worktree_dirty_files: 189
---
# Coding Conventions

**Analysis Date:** 2026-07-29

## Naming Patterns

**Files:**
- Use lowercase kebab-case for domain directories and most implementation files. Current examples include `src/modules/action-invocation/internal/async-durable-port.ts`, `src/modules/catalog/internal/owner-public-flow.ts`, and `src/modules/notification-outbox/internal/dispatch-request.ts`.
- Use `public.ts` for a module's supported external seam and keep implementation-only code below `internal/`; current examples are `src/modules/catalog/public.ts` and `src/modules/registry/public.ts`.
- Use `<domain>.actions.ts` for registered action contracts and `<domain>.functions.ts` for source adapters. Register actions explicitly in `src/modules/actions/index.ts`.
- Use camelCase filenames for Convex hosts, such as `convex/customerRequestApplication.ts`; co-located adapters use role-oriented names such as `convex/customerRequestRefinePorts.ts`.
- Name Vitest files `*.test.ts` or `*.test.tsx`; name Playwright files `*.spec.ts`. Architectural source locks use the `*-thinness.test.ts` suffix.

**Functions:**
- Use camelCase verb phrases such as `buildCatalogDiscoveryManifest`, `searchPublicBusinessCatalog`, and `listOwnerInbox`.
- Name dependency-injection factories with a concern plus `Ports`, for example `setCatalogSearchBackendForTests` and source-owned ports factories.
- Keep `use*` names for genuine React hooks; application and module tests treat route/application thinness as a separately checked concern.
- Prefer one source-owned operation behind multiple adapters rather than duplicating business decisions in routes, UI, Convex hosts, or test harnesses.

**Variables:**
- Use camelCase for locals and module values; use SCREAMING_SNAKE_CASE for stable shared constants and test catalogs.
- Preserve semantic identities in names (`requestRef`, `routeRef`, `offeringRef`, `operationKey`) instead of collapsing distinct identifiers into generic `id` values.
- Use `Values` suffixes for literal vocabularies and derive their union types, as in the catalog and registry modules.

**Types:**
- Use PascalCase type aliases. Current module contracts favor `type` for ports, commands, results, and DTOs.
- Model ordinary refusal, missing, conflict, unsupported, and uncertainty outcomes as discriminated unions, normally on `kind`; do not replace them with booleans or generic exceptions.
- Keep result variants explicit and readonly where the contract is shared across surfaces. `src/modules/common/action.ts` defines action result and authority/retry vocabularies as literal unions.
- Keep identity and authority distinct in names and types. An authenticated caller or agent identity is attribution; it is not by itself permission for a different consequence.
- Mark public collections readonly and use `as const` for literal vocabularies. Keep Convex runtime types and `ctx` access at Convex boundaries rather than in pure domain modules.

## Code Style

**Formatting:**
- No Prettier, Biome, or ESLint configuration is present. No `format` script exists in `package.json`.
- Representative TypeScript uses two-space indentation, single quotes, no semicolons, and trailing commas in multiline calls and objects. Follow the neighboring file rather than introducing style-only churn.
- Keep comments focused on invariants, authority boundaries, registration, recovery, or non-obvious platform constraints.

**Linting:**
- The available lint command is `npm run lint`, which runs `oxlint src convex tests tools examples --deny-warnings` from `package.json`.
- `.oxlintrc.json` enables the `correctness` category as errors, turns `suspicious` off, and enables the `typescript` and `oxc` plugins.
- `.oxlintrc.json` sets `no-debugger` to error and explicitly disables `no-control-regex`, `no-underscore-dangle`, `no-unused-vars`, `no-useless-escape`, and `typescript/triple-slash-reference`.
- Generated Convex output, the routing-agent worker declaration, deliberate fixtures, and `vendor/` are ignored by `.oxlintrc.json`.
- `tsconfig.json` is a separate type-quality gate with `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `forceConsistentCasingInFileNames`, `isolatedModules`, and `noEmit` enabled.

## Import Organization

**Order:**
1. Node built-ins, when a runtime file needs them.
2. Third-party runtime and test packages.
3. `@/` or `~/` aliases into `src/`.
4. Relative imports within the same module or package.
5. Use `import type` for type-only imports.

Representative tests such as `tests/integration/registry-api.test.ts` separate Vitest imports, source aliases, and route-relative imports with blank lines. Preserve a local file's established grouping when a value import and its type import are intentionally adjacent.

**Path Aliases:**
- `@/*` and `~/*` both resolve to `src/*` in `tsconfig.json`.
- `@/routes/owner.*`, `@/routes/admin.*`, and `@/routes/developers.discovery` map operator route aliases in `tsconfig.json`.
- Vitest resolves aliases with `tsconfigPaths: true` in `vitest.config.ts`.

**Boundary Rules:**
- Import another domain through `src/modules/<domain>/public.ts`; sibling modules and routes must not reach into `internal/`.
- Routes and Convex hosts consume public/source seams. Pure domain modules do not import `convex/_generated`, `convex/server`, or access `ctx.db`.
- `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, and domain-specific files in `tests/imports/` are executable architecture policy, not merely examples.
- Register operations explicitly in `src/modules/actions/index.ts`; module evaluation side effects do not constitute registration.
- Keep routes as transport adapters. The route should authenticate/parse/project and delegate to a source-owned function, not own business rules, authority, reconciliation, or provider policy.
- Preserve the distinction between discovery inventory and routeable supply, identity and authority, and dispatch attempts and external outcomes. `src/modules/registry/` and `src/modules/customer-request/` are different ownership seams.
- For action contracts, use `defineAction` with strict schemas, honest `summary` and `boundaries`, explicit surfaces, and a `run` function that delegates to the shared source operation; the contract is defined in `src/modules/common/action.ts`.
- For payment-adjacent transport, keep caller-controlled amount, currency, recipient, endpoint, and credential out of authority decisions. Tests and copy gates must not translate a challenge, signature, identifier, or receipt into proof of real-world work.
- For Convex changes, keep schema fragments owned by the domain and composed by the root schema; keep `node:*` imports out of modules reachable by queries and mutations. `npm run check:convex-codegen` is the configured dry-run gate.

## Error Handling

**Patterns:**
- Return typed discriminated unions for expected domain outcomes. Callers branch on `kind` and preserve specific refusal or error codes.
- Return uncertainty as data and expose the safe continuation. Do not treat an ambiguous external effect as an ordinary retryable failure.
- Throw only for broken invariants, impossible setup, or programmer errors. Expected unsupported, refused, stale, missing, and conflict states are result values.
- Validate external inputs at boundaries with strict Zod schemas or exact shape guards; validate Convex inputs and returns with `v.*`. Use `safeParse` for ordinary invalid input.
- Use exhaustive union handling with a `never` assignment when switching over a closed vocabulary.
- Use `try`/`finally` whenever tests or adapters temporarily change environment variables, globals, servers, injected backends, or timers.
- Do not expose raw provider, database, credential, or private customer payloads. Return redacted structured codes and persist evidence through the owning observability seam.

## Logging

**Framework:** Structured telemetry dependencies are present (`@sentry/node`, `@sentry/react`, `posthog-js`, and `posthog-node`); durable business evidence is owned by `src/modules/observability/`. Console logging is not the default domain pattern.

**Patterns:**
- Record business-significant actions as structured audit, funnel, receipt, or evidence records rather than free-form console strings.
- Redact inquiry content, credentials, and provider payloads before persistence or logging.
- Use `console` at CLI/script boundaries or where a runtime integration explicitly owns operational logging.
- In Convex interpretation failures, emit a stable redacted code instead of customer or provider input; keep logging behavior behind the relevant source/host seam.

## Comments

**When to Comment:**
- Explain trust boundaries, explicit registration, recovery behavior, or why a simpler implementation would weaken authority or evidence.
- Keep public action intent in action `summary` and `boundaries` fields rather than duplicating it in scattered comments.
- Do not use stale phase-history comments or TODOs in place of typed states, executable policy tests, or source-owned evidence.

**JSDoc/TSDoc:**
- Use sparingly for exported contracts whose invariants are not evident from types. `src/modules/common/action.ts` contains representative contract documentation.
- Prefer names, discriminated types, and boundary tests over extensive API prose.

## Function Design

**Size:** Keep pure decisions small enough to test directly. Keep Convex hosts thin: validator, authentication, persistence, scheduler, and source wiring should remain separate from domain decisions. Thinness locks are located under `tests/unit/` in domain-specific suites.

**Parameters:** Prefer a typed input object plus a typed ports object over long positional lists. Inject clocks, network calls, persistence, and schedulers through ports or explicit options.

**Return Values:** Return serializable readonly result shapes with specific `kind` and `code` values. Do not return deferred patch plans for hosts to interpret; ports perform semantic IO inside the owning transaction.

**Runtime validation:** Parse unknown request and provider input once at the boundary. Do not cast unknown payloads into domain types. Keep Zod schemas near the owned contract and Convex validators at the host boundary; tests should include malformed, extra-key, and materially stale cases where applicable.

## Module Design

**Exports:**
- Export a narrow domain API from `public.ts`; keep implementation details under `internal/`.
- Put pure decisions and contracts in `src/modules/`; keep database, scheduler, and runtime IO in Convex hosts or explicit ports.
- Declare actions once in `<domain>.actions.ts`, delegate to shared source functions, and register them in `src/modules/actions/index.ts`.
- Keep validators on external/Convex boundaries and domain state machines independent of Convex runtime types.

**Barrel Files:**
- Use `public.ts` for external module APIs and `index.ts` for a deliberately cohesive internal family, as in `src/modules/inquiries/internal/ledger/index.ts`.
- Do not create barrels that bypass `internal/` privacy or create deep, opaque re-export chains.

**Prescriptive Layering:**
| Layer | Location | Use | Avoid |
|---|---|---|---|
| Pure domain | `src/modules/<domain>/` | Types, decisions, state machines, port contracts | Convex runtime and direct IO |
| Private implementation | `src/modules/<domain>/internal/` | Same-domain details | Cross-domain imports |
| Source adapters/actions | `src/modules/<domain>/*.functions.ts`, `*.actions.ts` | Bind shared operations to surfaces | Duplicate business logic |
| Convex host/adapters | `convex/*.ts`, `convex/*Ports.ts` | Validators, auth, DB, scheduler | Large inline decision engines |
| Routes/UI | `src/routes/`, `src/components/` | Projection and interaction | Private module imports |

**Project-specific quality constraints:**
- Use the registered-action seam and current `ActionSurface` values from `src/modules/common/action.ts`; registration alone does not prove a public route or customer reachability.
- Keep identity attribution separate from exact bounded authority, and preserve refusal, uncertainty, idempotency, and reconciliation semantics in the source-owned contract.
- Keep assistant and human projections aligned with the same source-owned meaning. Run `npm run test:ui-contract` for visible contract changes and `npm run test:seo` for discovery/metadata output.

---

*Convention analysis: 2026-07-29*
