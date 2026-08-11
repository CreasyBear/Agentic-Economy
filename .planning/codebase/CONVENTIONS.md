# Coding Conventions
**Analysis Date:** 2026-08-11

## Naming Patterns
- TypeScript identifiers use `camelCase` for values/functions, `PascalCase` for types/classes/React components, and `UPPER_SNAKE_CASE` for bounded constants. UI components are normally `Ae...` (for example `src/components/ae/chat/AeThreadHeader.tsx`); domain result unions use a `kind` discriminant and named `reason` codes.
- Route filenames mirror the public URL (`src/routes/api.v1.operations.execute.ts`, `src/routes/t.$threadId.tsx`). Module entry seams are `public.ts`; implementation-only code lives below `internal/` (for example `src/modules/capability-supply/internal/publication/`).
- IDs, revisions, digests, refs, and environment names remain explicit in names rather than being collapsed into generic `string` fields; Convex DTOs in `convex/registry.ts` use literal unions for states and source versions.

## Code Style
- `tsconfig.json` is strict: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `isolatedModules`, and `noEmit` are enabled. Runtime TypeScript is expected to avoid explicit `any`, double casts through `unknown`, non-null assertions, broad status/result strings, and unbounded Convex return validators; `src/lib/ui/contract-scans.ts` and `tests/imports/ts-standards.test.ts` enforce these rules.
- Dominant source style is two-space indentation, single-quoted strings, no semicolons, trailing commas, and narrow explicit return types. Use `Readonly` input/result objects and literal unions rather than mutable bags or broad strings (see `src/modules/capability-supply/internal/publication/admit.ts`).
- Validate at boundaries with Zod schemas or Convex `v.*` validators. Prefer `z.strictObject`/discriminated unions for external material and exact `returns` validators for Convex functions (`convex/answerThreads.ts`, `convex/_generated/ai/guidelines.md`).
- There is no repository Prettier configuration. The declared lint/type checks are `npm run lint` (`oxlint src convex tests tools --deny-warnings`) and `npm run typecheck` (`tsc --noEmit`); do not introduce a second formatting convention.

## Import Organization
- Use the configured `@/*` and `~/*` aliases to `src/*`; special route aliases for owner/admin/developer routes are declared in `tsconfig.json`. Vite and Vitest both enable the same path mapping (`vite.config.ts`, `vitest.config.ts`).
- Imports are conventionally grouped as built-ins/external packages, a blank line, `@/` module/lib imports, then same-directory relative imports. Use `import type` for type-only dependencies; preserve local imports at the end of a module (see `src/components/ae/chat/AeThreadHeader.tsx`).
- Modules expose stable public seams through `src/modules/<name>/public.ts`; routes and sibling modules must not import `internal/`. `scanPrivateImports` in `src/lib/ui/contract-scans.ts` and `tests/imports/private-imports.test.ts` are the executable rule.
- Routes are adapters: they must use module/server public ports and must not import Convex schema/generated transport or private module files. `scanRouteBoundaries` and `tests/imports/route-boundary.test.ts` enforce this; `src/routes/api.v1.operations.execute.ts` delegates to `src/lib/server/operation-invoke-api.ts`.

## Error Handling
- Model expected domain failures as discriminated results (`{ kind: 'refused', reason }`, `{ kind: 'replayed' }`, etc.) and narrow before reading variant fields. Admission/normalization code returns named refusal codes and catches untrusted normalizer failures (`src/modules/capability-supply/internal/publication/admit.ts`).
- HTTP adapters project protocol failures through the shared RFC 9457 model in `src/lib/errors.ts` and `src/lib/server/problem.ts`; use `problem(...)`, canonical `kind`, stable `code`, bounded `detail`, and correlation headers instead of ad-hoc `{ error: ... }` envelopes. Explicit method handlers use `methodNotAllowed(...)` (`src/routes/api.v1.operations.execute.ts`).
- CLI commands convert known failures to `CliFailure` and `sourceErrorToCliFailure`, then emit either one human-safe stderr line or the structured `--json` envelope (`tools/ae/cli.ts`, `tools/ae/lib/output.ts`). Never dump raw provider/HTTP bodies to stderr.
- Throw only for genuinely exceptional boundaries (missing configuration, impossible fixture/programmer state, or unrecoverable infrastructure). Catch `unknown`, classify it, and return a safe typed result where the caller can recover; tests should assert the named outcome, not an incidental exception message.

## Logging
- Log operator-actionable/provider failures with stable event codes and a request correlation ID; expected refusals and ordinary recovery paths stay quiet. Current examples are `console.error` in `src/modules/customer-request/application/interpret-compile/interpreter.ts` and `convex/customerRequestApplication.ts`, and `console.warn` for held notification dispatch in `src/routes/api.notification.novu-dispatch.ts`.
- Prefer the observability seams (`src/lib/observability/sentry.server.ts`, `src/lib/observability/posthog.server.ts`, `src/lib/server/gateway-telemetry.ts`) over ad-hoc diagnostic payloads. Propagate `x-ae-request-id` through `src/lib/server/request-correlation.ts`.
- Redact credentials, private keys, authorization values, share tokens, raw provider payloads, and user-private identifiers before telemetry (`src/lib/observability/private-route-safety.ts`). Error details are parameter-free where possible; environment variable names may identify configuration, never its value (`src/lib/server/notification-provider.ts`).

## Comments
- Use doc comments for public contracts and boundary rationale (RFC/error model in `src/lib/errors.ts`, route/transport restrictions in `src/lib/ui/contract-scans.ts`). Inline comments should explain why a security, runtime, or evidence constraint exists, not restate the next line.
- Document intentional deviations at the seam: approved `v.any()` JSON boundaries must carry the runtime-validation explanation recognized by `src/lib/ui/contract-scans.ts`; generated files and fixtures are excluded by `.oxlintrc.json`.
- Keep comments current with the source/local/hosted evidence class. Do not place credentials, tokens, or secret-bearing examples in comments or fixtures.

## Function Design
- Validate and bound inputs first, return early on refusal, and keep the success path linear. Public async functions declare `Promise<...>` and accept immutable input; use ports/callbacks for DB, HTTP, clock, model, and telemetry dependencies rather than hidden global side effects (`src/modules/capability-supply/internal/publication/admit.ts`).
- Keep normalizers, digest builders, projections, and result mappers pure where possible. Runtime adapters own network/Convex effects; map external errors at that adapter boundary and preserve domain outcomes.
- Narrow `unknown` before use, avoid `!`, and preserve optional-field semantics with conditional object spreads under `exactOptionalPropertyTypes`. Bound body sizes, collection limits, and external response material at the server boundary.

## Module Design
- Treat `src/modules/<name>/public.ts` as the only cross-module API. Keep schemas, Convex ports, and implementation helpers under `internal/`; migrate every caller through the public seam rather than adding compatibility re-exports.
- Keep route files thin TanStack adapters (`createFileRoute` plus method handlers) and keep Convex host files focused on validators, persistence, and calls into module public functions. `convex/registry.ts` and `convex/answerThreads.ts` show exact argument/return validators and typed durable results.
- Keep protocol/error projection centralized (`src/lib/errors.ts`, `src/lib/server/problem.ts`, `tools/ae/lib/output.ts`). UI components consume public DTOs and callbacks, own only presentation/local state, and use accessible role-based interactions (`src/components/ae/chat/AeThreadHeader.tsx`).

---
*Convention analysis: 2026-08-11*
*Update when patterns change*
