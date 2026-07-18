# Coding Conventions

**Analysis Date:** 2026-07-18
**last_mapped_commit:** 19e988f5

## Naming Patterns

**Files:**
- Domain modules: kebab-case directories under `src/modules/<domain>/` (e.g. `src/modules/customer-request/`, `src/modules/capability-supply/`).
- Module seams: `public.ts`, `<domain>.actions.ts`, `<domain>.functions.ts`, optional `internal/` (enforced by `tests/imports/private-imports.test.ts`).
- Application slices: verb-named folders under `application/` (e.g. `src/modules/customer-request/application/provide-facts/provide.ts`).
- React routes: TanStack file routes under `src/routes/` (`api.businesses.search.ts`, `help.tsx`).
- Legacy AE UI: `Ae*` components under `src/components/ae/` — do not extend this pattern for new presentation; prefer Astryx (`DESIGN.md`, `.agents/skills/ae-design-system`).
- Tests: `*.test.ts` / `*.test.tsx` under `tests/`; Playwright `*.spec.ts` under `tests/e2e/` and `tests/deploy-smoke/`.
- Thinness campaign: `*-thinness.test.ts` under `tests/unit/**` (source-structure guards, not behavior tests).

**Functions:**
- camelCase verbs: `provideCustomerRequestFacts`, `listPublicBusinessCatalog`, `scanPrivateImports`.
- Convex host wrappers stay thin and delegate to `*Application` / `*FromModule` names (see thinness tests).
- Server fns: `*Server` / `*ThroughSource` in `<domain>.functions.ts`.
- Boolean helpers: `is*` / `has*` (`isPartialRouteResult` in `src/modules/customer-request/application/public.ts`).

**Variables:**
- camelCase locals; SCREAMING_SNAKE for module-level constants (`MAX_OPAQUE_CONFIG_BYTES` patterns, `JOURNEY_EVENT_VERSION` in `src/lib/ui/journey-events.ts`).
- Prefer `const` + `readonly` / `Readonly<T>` for public contracts.

**Types:**
- PascalCase types and interfaces.
- Discriminated unions with `kind` (and often `reason`): `{ kind: 'refused', reason: '...' }`, `{ kind: 'ok', ... }`.
- Value unions via `as const` arrays + indexed access: `export const IndexStatusValues = [...] as const` then `export type IndexStatus = (typeof IndexStatusValues)[number]` (`src/modules/registry/public.ts`).
- Branded IDs via `Brand<string, 'Name'>` in `src/modules/common/ids.ts` (`BusinessId`, `Slug`, `OperationKey`).
- Zod-inferred public types: `Readonly<z.infer<typeof schema>>` (`src/modules/capability-supply/public.ts`).

**Actions:**
- Stable ids: `"<domain>.<verb>"` (`registry.search`, `inquiry.submit`) in `src/modules/common/action.ts` / `src/modules/actions/index.ts`.

## Code Style

**Formatting:**
- No Prettier/Biome config in repo root. Style is enforced by TypeScript + oxlint + review.
- Prefer single quotes and no semicolons where existing files already do (majority of `src/` and `tests/`).
- Trailing commas and multiline object literals are common in tests and public APIs.

**Linting:**
- Tool: oxlint (`npm run lint` → `oxlint src convex tests tools examples --deny-warnings`).
- Config: `.oxlintrc.json` — `correctness` as error; `suspicious` off; plugins `typescript`, `oxc`.
- Ignores: `convex/_generated/**`, `tests/fixtures/**`, `vendor/**`.
- Inline disables appear rarely for intentional React dependency freezes (e.g. `oxlint-disable-next-line react-doctor/exhaustive-deps` in `src/components/ae/chat/AeThreadTurnStreamSection.tsx`).

**TypeScript compiler (must follow):**
- Config: `tsconfig.json` — `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`.
- Path aliases: `@/*` and `~/*` → `src/*`; special owner/admin route remaps for `@/routes/owner.*` etc.
- Package is `"type": "module"` (`package.json`).

**Type-hole guardrail (executable):**
- `npm run test:ts-standards` runs `tests/imports/ts-standards.test.ts` via `scanTypeScriptStandards` in `src/lib/ui/contract-scans.ts`.
- Rejects: `explicit-any`, `non-null-assertion`, `convex-any-validator`, `broad-status-string`, hard-coded source CSRF, client-exposed source-write secrets.
- Fixture mode: `AE_SCAN_MODE=fixtures` against `tests/fixtures/bad-ts-standards`.

## Import Organization

**Order (observed / follow):**
1. Node built-ins (`node:fs`, `node:path`) when needed.
2. External packages (`vitest`, `zod`, `@testing-library/react`, `convex-test`).
3. Blank line.
4. Aliased app imports (`@/modules/...`, `@/lib/...`, `@/routes/...`, `@/components/...`).
5. Relative imports within the same module (`./internal/...`, `../interpret-compile`).
6. `import type` for type-only imports (preferred over value imports for types).

**Rules:**
- Imports stay at the top of the file. No inline/dynamic imports for ordinary code (workspace rule); dynamic `import()` only for intentional lazy/Convex module graphs.
- Outside a module, import only `public.ts` or the module’s declared `*.functions.ts` / `*.actions.ts` seams — never `internal/*` (`tests/imports/private-imports.test.ts`, rule `module-private-import`).
- `public.ts` re-exports internals with an `Impl` alias pattern (`syncCatalogProjection as syncCatalogProjectionImpl` in `src/modules/registry/public.ts`).
- Do not import `.planning/` or backup repos from runtime (`scanBackupImports` in `src/lib/ui/contract-scans.ts`).
- Protocol/money SDKs (`@x402/*`, `viem`, etc.) stay quarantined to reviewed transport adapters (same scanner).

**Path Aliases:**
- `@/modules/<domain>/public` for cross-module domain APIs.
- `@/lib/...` for shared non-domain utilities.
- Relative paths inside one module’s `internal/` or `application/` tree.

## Error Handling

**Patterns:**
- Prefer **discriminated results** over thrown exceptions for domain outcomes: `kind: 'refused' | 'conflict' | 'ok' | ...` with snake_case `reason` strings (`src/modules/customer-request/application/provide-facts/provide.ts`, `src/modules/customer-request/standing-route-authority.ts`).
- Validation at public boundaries: Zod `.parse` / `.safeParse`; on failure throw short snake_case errors (`capability_offering_invalid` in `src/modules/capability-supply/public.ts`) or return `kind: 'invalid'` result unions (`src/modules/capability-contract/public.ts`).
- Action results: `ActionResult = Readonly<{ kind: string } & Record<string, unknown>>` (`src/modules/common/action.ts`); schemas use `.strict()` objects.
- Catch variables are `unknown` (`useUnknownInCatchVariables`); narrow before use.
- Exhaustive switches: assign `const _exhaustive: never = variant` (or `exhaustive`) in `default` (`src/lib/operator/navigation.ts`, `src/modules/customer-request/application/route-plan-projection/project-run.ts`).

**Do not:**
- Use `any` or non-null assertions (`!`) in runtime source — scanner-enforced.
- Swallow failures silently at trust boundaries; refuse with an explicit `kind`/`reason`.

## Logging

**Framework:** Sentry for exception capture; sparse `console.*` at server edges.

**Patterns:**
- Client: `src/lib/observability/sentry.client.ts` — `Sentry.captureException`.
- Server: `src/lib/observability/sentry.server.ts`; request isolation in `src/start.ts`.
- React: `src/components/ae/feedback/AeObservabilityErrorBoundary.tsx` wraps with `Sentry.ErrorBoundary`.
- Operational warnings: `console.warn` / `console.error` with redacted or coded messages (e.g. `src/routes/api.notification.novu-dispatch.ts`, `src/modules/customer-request/application/compare-resume/refresh.ts`).
- Do not log secrets, full PII, or unredacted provider payloads.

## Comments

**When to Comment:**
- Module/file headers that document contracts and fan-out surfaces (see `src/modules/common/action.ts`).
- Rare inline comments for intentional freezes or non-obvious invariants.
- Prefer self-describing `kind`/`reason` and test names over narrative comments.

**JSDoc/TSDoc:**
- Used on load-bearing public contracts (`ActionDefinition` in `src/modules/common/action.ts`).
- Not required on every function; domain vocabulary belongs in types and `UBIQUITOUS_LANGUAGE.md`.

## Function Design

**Size:**
- Keep Convex hosts thin: wire + ports + delegate. Domain logic lives under `src/modules/**` (thinness campaign).
- Prefer port objects (`ProvideFactsPorts`, `eligibleSupplyPorts`) injected as the second argument so unit tests pass fakes without mocking modules.

**Parameters:**
- Input object + ports object for application commands (`provideCustomerRequestFacts(input, ports)`).
- Action runners: `({ data, context }) => Promise<Result>` (`src/modules/common/action.ts`).

**Return Values:**
- Always typed; prefer `Readonly<>` for public DTOs.
- Use `as const` on literal fields in returned objects for narrowing.

## Module Design

**Exports:**
- External callers use `public.ts` only.
- Register new actions by importing consts into `src/modules/actions/index.ts` (explicit array — no bare side-effect registration; bundler tree-shakes those).
- Convex tables: define in module `internal/schema.ts` (or inquiries/answer-thread `internal/convex-schema.ts`), spread in `convex/schema.ts` (`.agents/skills/ae-convex-guardrails`).

**Barrel Files:**
- `public.ts` is the intentional barrel. Avoid deep re-export trees that expose `internal/`.
- Application barrels: `src/modules/customer-request/application/public.ts` for host adapters.

**UI / copy:**
- Astryx first for new UI; Tailwind as layout glue only.
- Public/assistant copy: boundary-honest, no booking/payment/dispatch overclaims (`.agents/skills/ae-public-copy-guardrails`); enforce with `npm run test:copy`.

## React Conventions

- File-level Vitest env for DOM tests: `/** @vitest-environment jsdom */` at top of `*.test.tsx`.
- Testing Library: `@testing-library/react` (`render`, `screen`, `cleanup`, `fireEvent`).
- Prefer role/text queries that match accessible UI (`screen.getByRole` in `tests/unit/status/owner-trust-progress.test.tsx`).
- Exhaustive handling of UI event/part unions with `never` defaults.

## Anti-Patterns (do not introduce)

| Anti-pattern | Instead |
|---|---|
| Import `src/modules/foo/internal/*` from routes or other modules | Import `@/modules/foo/public` |
| Fat Convex hosts with inventory/domain bodies | Thin host + module ports; add `*-thinness.test.ts` |
| `any` / `!` / loose status strings | Narrow unions, branded ids, Zod |
| New bespoke `Ae*` presentation shells / shadcn wrappers | Astryx primitives |
| Owner-only actions with `agentTools` | `surfaces: ['ui', 'http']` only |
| Inline table defs in `convex/schema.ts` | Module schema fragments |

---

*Convention analysis: 2026-07-18*
*last_mapped_commit: 19e988f5*
