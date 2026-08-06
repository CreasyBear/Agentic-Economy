# Coding Conventions
**Analysis Date:** 2026-08-06

## Naming Patterns
- **Files:** kebab-case for modules and helpers (`stable-hash.ts`), PascalCase for React components (`AeServiceRow.tsx`), camelCase for hooks (`useErrorShake.ts`). Convex functions use camelCase file names (`customerRequestRouteMandate.ts`). Test files mirror source: `<name>.test.ts` / `<name>.test.tsx` trailing `.test`.
- **Functions:** camelCase, verb-first for actions (`defineCapabilityContract`, `rehydrateCapabilitySelectionKey`, `openCapabilityDecisionModel`). Predicates use `is*`/`has*`/`same*`/`valid*` (`isBoundedJsonValue`, `sameCapabilityContractRef`, `instancePointerExists`).
- **Variables/constants:** `UPPER_SNAKE_CASE` for module-level constants (`MAX_CONTRACT_JSON_BYTES`, `CAPABILITY_CONTRACT_FORMAT`); `camelCase` for locals; `kebab-case` for public API DTO suffixes (`api-key`).
- **Types/interfaces:** PascalCase, prefixed with the owning domain (`CapabilityContract`, `CapabilityInputFact`, `ValidationError`). DTOs end in `Dto` (`PublicBusinessCatalogApiV2Dto`).
- **Branded types:** nominal brands declared via a `declare const ...Brand: unique symbol` and a `string & Readonly<{ [Brand]: true }>` alias (`CapabilitySelectionKey`, `PointedSchemaIdentity`), rehydrated through `rehydrate*` functions.
- **Discriminated unions / tagged results:** `kind` field, often with a `stage` (`CapabilityInputAssessment` = `viable | needs_information | incompatible`; `CapabilityDocumentValidation` = `valid | invalid`).

## Code Style
- **Formatting:** Prettier defaults with **no** `.prettierrc`/`.prettierrc.json` config committed — single quotes, semicolons, trailing commas, 2-space indent, 80-col soft wrap. Formatting is convention, not tool-enforced (no `prettier` dependency).
- **Linting:** `oxlint` via `.oxlintrc.json`, run as `npm run lint` = `oxlint src convex tests tools --deny-warnings`. `correctness` category is `error`, `suspicious` is `off`. Enabled plugins: `typescript`, `oxc`. Defaults flipped: `no-debugger` error, `no-control-regex`/`no-underscore-dangle`/`no-unused-vars`/`no-useless-escape` off. Ignores `convex/_generated/**`, `tests/fixtures/**`, `vendor/**`.
- **Types:** `strict` with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride` all on (`tsconfig.json`).
- **Readonly culture:** public types are `Readonly<{...}>` / `readonly T[]` pervasively; module-level tables are `ReadonlySet`/`ReadonlyMap`. Write types never leak to public projection surfaces.

## Import Organization
- **Order:** Node builtins first (`node:fs`, `node:path`), then external packages (alphabetical), then internal aliases — one blank line between groups. See `tests/unit/ui/trust-projection.test.ts` (node → vitest → `@/...`).
- **Path aliases** (`tsconfig.json` + `vite.config.ts` + `vitest.config.ts` via `resolve.tsconfigPaths`): `@/*` and `~/*` → `./src/*`. Prefer `@/` everywhere in source and tests. Special operator route aliases: `@/routes/owner.*`, `@/routes/admin.*`, `@/routes/developers.discovery` → `./src/routes/_operator/...`.
- **Barrel files:** domain `public.ts` files export the public surface, then re-export `type` separately (`import type { ... }` for type-only pulls, erased at runtime).

## Error Handling
- **Validation-driven:** inputs are validated with `zod` (`z.strictObject`, `z.union`, `z.lazy`); failures throw typed errors or return tagged result unions — prefer returning a `{ kind: 'invalid'; issues }` result over throwing for expected invalid input.
- **Assertions:** internal invariants via `assert*` helper functions (`assertSchemaIsSafeAndValid`, `assertUniqueSemanticIds`).
- **Unknown catches:** `useUnknownInCatchVariables` — narrow with `isRecord`/type guards before use; see `src/modules/common/is-record.ts`.
- **Optionality errors:** refusal enums are engine error **codes** and must not be renamed when reworded (e.g. `adapter_not_registered`, `payment_required_invalid`).
- **Refusal strings** (user-facing) are owner language; codes are stable identifiers.

## Logging
- **Sentry** for runtime observability: `@sentry/react` wired in `vite.config.ts`, with `sentryVitePlugin` enabled when `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` env vars are set (release from `SENTRY_RELEASE` or `VERCEL_GIT_COMMIT_SHA`).
- **No ad-hoc `console.*`** that would trip lint — capture context keys (`SENTRY_*`) only by name in docs/tests, never values.

## Comments
- **JSDoc/TSDoc:** `/** ... */` for public exports that need explanation (e.g. the contract mirrors Vercel AI SDK `inputExamples` shape); one-line intent above non-obvious helpers.
- **Rationale comments:** explain *why* for non-obvious deterministic rules (e.g. greedy uncovered-token selection, observed-x402 pool gate).
- **TODO/FIXME:** tracked in `.planning/codebase/CONCERNS.md`; use a plain `TODO:`/`FIXME:` line where unavoidable.

## Function Design
- **Small, single-purpose, verb-named;** pure where the domain allows (validation, projection, normalization).
- **Deterministic kernel:** functions that gate execution (eligibility, selection, contract validation) are pure and deterministic; model/provider observations are never trusted until validated.
- **Parameters:** prefer a single typed options object for >2 args; return values are typed, Readonly, and often result unions rather than throwing.

## Module Design
- **Per-domain folders** under `src/modules/<domain>/` with a `public.ts` entry that exports only the domain's public API; private helpers stay non-exported in the module.
- **Convex separation:** `src/modules/*/public.ts` (pure logic) + `*.functions.ts` (Convex port adapters) + `convex/*.ts` (durable functions/writes). Domain logic is not duplicated across routes/MCP/CLI/UI — routes consume redacted projections from `public.ts`.
- **Single registry:** `src/modules/actions/index.ts` is the one cross-surface action registry; no parallel copies.
- **Byte-economy:** avoid needless allocations/copies (deep-freeze once, reuse compilers via caches like `compiledContracts` Map).
---
*Convention analysis: 2026-08-06*
